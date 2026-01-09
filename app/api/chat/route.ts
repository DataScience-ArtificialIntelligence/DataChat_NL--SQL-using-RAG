export const runtime = "nodejs";

import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";

import { getTableSchema, findLatestTable, ensureDbReady } from "@/lib/db";
import { executeQuery } from "@/lib/query-executor";
import { getOrCreateSession } from "@/lib/session";
import { addMemory } from "@/lib/memory";
import { ensureRagSetup } from "@/lib/setup";

import {
  getSchemaContextForQuery,
  populateSchemaRegistry,
} from "@/lib/schema-registry";

import {
  findSimilarCachedQuery,
  storeQueryInCache,
} from "@/lib/query-cache";

import { embedText } from "@/lib/embeddings";

import { structuredReasoning } from "@/lib/reasoning/structuredReasoning";
import { normalizePlan } from "@/lib/reasoning/normalizePlan";
import { validatePlan } from "@/lib/reasoning/validator";
import { extractMetrics } from "@/lib/reasoning/extractMetrics";
import { buildSQL } from "@/lib/sql/sqlBuilder";

import { registerLogicalTable } from "@/lib/reasoning/logicalSchemaRegistry";

import type { QueryResult } from "@/lib/types";

/* ----------------------------- helpers ------------------------------ */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 1500
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await sleep(delayMs);
    return withRetry(fn, retries - 1, delayMs);
  }
}

/* 🔒 Metric intent detector (HARD GUARANTEE) */
function requiresMetric(question: string): boolean {
  const q = question.toLowerCase();
  return [
    "how many",
    "count",
    "number of",
    "average",
    "avg",
    "mean",
    "total",
    "sum",
    "maximum",
    "minimum",
    "max",
    "min",
  ].some(k => q.includes(k));
}

/* ----------------------------- route ------------------------------ */
export async function POST(req: Request) {
  console.log("🚀 /api/chat STARTED");

  try {
    await ensureRagSetup();
    await ensureDbReady();

    const { message, tableName, sessionId } = await req.json();

    if (!message?.trim()) {
      return Response.json(
        { content: "Please provide a question.", error: "invalid_input" },
        { status: 400 }
      );
    }

    /* -------- Session -------- */
    const session = sessionId
      ? { id: sessionId, createdAt: Date.now() }
      : await getOrCreateSession();

    await addMemory({
      sessionId: session.id,
      role: "user",
      content: message,
    }).catch(() => {});

    /* -------- Load PHYSICAL schema -------- */
    let physicalTableName = tableName ?? null;

    let physicalSchema = await withRetry(() =>
      getTableSchema(physicalTableName ?? undefined)
    );

    if (!physicalSchema || Object.keys(physicalSchema).length === 0) {
      const fallback = await findLatestTable();
      if (fallback) {
        physicalTableName = fallback;
        physicalSchema = await getTableSchema(fallback);
      }
    }

    if (!physicalTableName || !physicalSchema[physicalTableName]) {
      return Response.json(
        { content: "No tables available.", error: "no_tables" },
        { status: 400 }
      );
    }

    /* -------- Register LOGICAL schema -------- */
    const logicalTableName =
      physicalTableName.replace(/^session_[^_]+_/, "");

    registerLogicalTable({
      logicalName: logicalTableName,
      physicalName: physicalTableName,
      description: "User dataset",
      columns: physicalSchema[physicalTableName].columns.map(c => c.name),
    });

    await populateSchemaRegistry(physicalSchema).catch(() => {});

    const schemaContext = await getSchemaContextForQuery(message);

    /* -------- SAFE numeric column inference -------- */
    const numericColumns =
      physicalSchema[physicalTableName].columns
        .filter(c => {
          if (!c || typeof c.type !== "string") return false;
          const t = c.type.toLowerCase();
          return ["int", "float", "numeric", "double", "decimal"].some(x =>
            t.includes(x)
          );
        })
        .map(c => c.name);

    /* -------- Embedding -------- */
    let questionEmbedding: number[] = [];
    try {
      questionEmbedding = await embedText(message);
    } catch {}

    /* -------- Cache lookup -------- */
    if (questionEmbedding.length > 0) {
      const cacheHit = await withRetry(() =>
        findSimilarCachedQuery({
          sessionId: session.id,
          tableName: physicalTableName!,
          embedding: questionEmbedding,
        })
      );

      if (cacheHit) {
        const results = await withRetry(() =>
          executeQuery(cacheHit.normalized_sql)
        );

        return Response.json({
          content: `Cached result`,
          sql: cacheHit.normalized_sql,
          results,
          fromCache: true,
        });
      }
    }

    /* =================================================
       🧠 STRUCTURED REASONING
       ================================================= */
    let plan = await structuredReasoning(message, schemaContext);

    /* =================================================
       🔥 METRIC EXTRACTION (GENERAL)
       ================================================= */
    plan = extractMetrics(message, plan, numericColumns);

    /* 🚨 HARD ENFORCEMENT: NO METRIC → DEFAULT COUNT */
    if (requiresMetric(message) && plan.metrics.length === 0) {
      plan.metrics = [{ aggregation: "COUNT", column: "*" }];
      plan.columns = [];
      plan.group_by = [];
      plan.order_by = [];
      plan.limit = null;
    }

    /* =================================================
       🔒 NORMALIZATION + VALIDATION
       ================================================= */
    plan.tables = [logicalTableName];

    if (Array.isArray(plan.columns) && plan.columns.includes("*")) {
      plan.columns = [];
    }

    plan.columns = Array.isArray(plan.columns) ? plan.columns : [];
    plan.filters = Array.isArray(plan.filters) ? plan.filters : [];
    plan.metrics = Array.isArray(plan.metrics) ? plan.metrics : [];
    plan.group_by = Array.isArray(plan.group_by) ? plan.group_by : [];
    plan.order_by = Array.isArray(plan.order_by) ? plan.order_by : [];

    plan = normalizePlan(plan);
    validatePlan(plan);

    console.log("🧠 STRUCTURED PLAN (FINAL):");
    console.dir(plan, { depth: null });

    /* =================================================
       ⚙️ SQL (DETERMINISTIC)
       ================================================= */
    const sqlQuery = buildSQL(plan);

    console.log("⚙️ SQL BUILT BY SYSTEM:");
    console.log(sqlQuery);

    const results: QueryResult[] = await withRetry(() =>
      executeQuery(sqlQuery)
    );

    /* -------- Explanation -------- */
    let summary =
      plan.metrics.length > 0
        ? "Computed result."
        : `Found ${results.length} rows.`;

    try {
      const groq = createGroq({
        apiKey:
          process.env.GROQ_API_KEY ||
          process.env.NEXT_PUBLIC_GROQ_API_KEY!,
      });

      const explanation = await generateText({
        model: groq("llama-3.1-8b-instant"),
        prompt: `
User Question:
${message}

SQL:
${sqlQuery}

Result:
${JSON.stringify(results, null, 2)}
`,
        temperature: 0.3,
      });

      summary = explanation.text;
    } catch {}

    await addMemory({
      sessionId: session.id,
      role: "assistant",
      content: summary,
      sql: sqlQuery,
    }).catch(() => {});

    /* -------- Cache store -------- */
    if (questionEmbedding.length > 0) {
      await storeQueryInCache({
        sessionId: session.id,
        tableName: physicalTableName!,
        question: message,
        sql: sqlQuery,
        results,
        embedding: questionEmbedding,
      });
    }

    return Response.json({
      content: summary,
      sql: sqlQuery,
      results,
      fromCache: false,
    });
  } catch (err: any) {
    console.error("❌ SERVER ERROR:", err);
    return Response.json(
      { content: "Server error", error: err?.message || "unknown" },
      { status: 500 }
    );
  }
}

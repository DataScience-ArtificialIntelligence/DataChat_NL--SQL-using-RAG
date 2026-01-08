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
import { validatePlan } from "@/lib/reasoning/validator";
import { normalizeSchema } from "@/lib/reasoning/normalizeSchema";
import { buildSQL } from "@/lib/sql/sqlBuilder";

import type { QueryResult } from "@/lib/types";

/* -----------------------------
   helpers
------------------------------*/

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
    console.warn(`[chat] retrying (${retries} left)`);
    await sleep(delayMs);
    return withRetry(fn, retries - 1, delayMs);
  }
}

/* -----------------------------
   route
------------------------------*/

export async function POST(req: Request) {
  console.log("🚀 /api/chat STARTED");

  try {
    /* ---------------------------------
       Infra warmup
    ----------------------------------*/
    await ensureRagSetup();
    await ensureDbReady();

    const { message, tableName, sessionId } = await req.json();

    if (!message || !message.trim()) {
      return Response.json(
        { content: "Please provide a question.", error: "invalid_input" },
        { status: 400 }
      );
    }

    /* ---------------------------------
       Session
    ----------------------------------*/
    const session = sessionId
      ? { id: sessionId, createdAt: Date.now() }
      : await getOrCreateSession();

    await addMemory({
      sessionId: session.id,
      role: "user",
      content: message,
    }).catch(() => {});

    /* ---------------------------------
       Load schema
    ----------------------------------*/
    let actualTableName = tableName ?? null;

    let rawSchema = await withRetry(() =>
      getTableSchema(actualTableName ?? undefined)
    );

    if (!rawSchema || Object.keys(rawSchema).length === 0) {
      const fallback = await findLatestTable();
      if (fallback) {
        actualTableName = fallback;
        rawSchema = await getTableSchema(actualTableName);
      }
    }

    if (!rawSchema || Object.keys(rawSchema).length === 0) {
      return Response.json(
        { content: "No tables available.", error: "no_tables" },
        { status: 400 }
      );
    }

    /* ---------------------------------
       Normalize schema (CRITICAL FIX)
    ----------------------------------*/
    const schema = normalizeSchema(rawSchema);

    await populateSchemaRegistry(rawSchema).catch(() => {});

    const schemaContext = await getSchemaContextForQuery(message, rawSchema);

    /* ---------------------------------
       RAG — Embedding
    ----------------------------------*/
    let questionEmbedding: number[] = [];

    try {
      questionEmbedding = await embedText(message);
    } catch {
      console.warn("[chat] embedding failed");
    }

    /* ---------------------------------
       RAG — Cache lookup
    ----------------------------------*/
    if (questionEmbedding.length > 0) {
      const cacheHit = await withRetry(() =>
        findSimilarCachedQuery({
          sessionId: session.id,
          tableName: actualTableName ?? undefined,
          embedding: questionEmbedding,
        })
      );

      if (cacheHit) {
        const results = await withRetry(() =>
          executeQuery(cacheHit.normalized_sql)
        );

        return Response.json({
          content: `Cached result: found ${results.length} rows.`,
          sql: cacheHit.normalized_sql,
          results,
          fromCache: true,
        });
      }
    }

    /* ---------------------------------
       STRUCTURED REASONING + SAFE RETRY
    ----------------------------------*/
    let plan;

    try {
      plan = await structuredReasoning(message, schemaContext);
      validatePlan(plan, schema);
    } catch (err: any) {
      // One controlled retry with feedback
      plan = await structuredReasoning(
        message + `\nPrevious error: ${err.message}`,
        schemaContext
      );
      validatePlan(plan, schema);
    }

    /* ---------------------------------
       SQL GENERATION (DETERMINISTIC)
    ----------------------------------*/
    const sqlQuery = buildSQL(plan);

    /* ---------------------------------
       Execute SQL
    ----------------------------------*/
    const results: QueryResult[] = await withRetry(() =>
      executeQuery(sqlQuery)
    );

    /* ---------------------------------
       Explanation (optional LLM)
    ----------------------------------*/
    let summary = `Found ${results.length} rows.`;

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

SQL (generated programmatically):
${sqlQuery}

Rows returned: ${results.length}
Sample row:
${results[0] ? JSON.stringify(results[0]) : "none"}

Explain the result in plain English.
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

    /* ---------------------------------
       Store cache
    ----------------------------------*/
    if (questionEmbedding.length > 0) {
      await storeQueryInCache({
        sessionId: session.id,
        tableName: actualTableName ?? undefined,
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

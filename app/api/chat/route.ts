export const runtime = "nodejs";

import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";

import { getTableSchema, findLatestTable, ensureDbReady } from "@/lib/db";
import { executeQuery } from "@/lib/query-executor";
import { validateSQL } from "@/lib/sql-validator";
import { getOrCreateSession } from "@/lib/session";
import { systemPrompt } from "@/lib/prompts";
import { addMemory, getRecentMemory } from "@/lib/memory";
import { ensureRagSetup } from "@/lib/setup";
import { embedText } from "@/lib/embeddings";
import {
  findSimilarCachedQuery,
  storeQueryInCache,
} from "@/lib/query-cache";

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
       Infra warmup (CRITICAL FIX)
    ----------------------------------*/
    await ensureRagSetup();
    await ensureDbReady();

    const { message, history, tableName, sessionId } = await req.json();
    console.log("[chat] tableName received:", tableName);
    console.log("[chat] sessionId received:", sessionId);


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

    let actualTableName = tableName ?? null;

    await addMemory({
      sessionId: session.id,
      role: "user",
      content: message,
    }).catch(() => {});

    /* ---------------------------------
       Groq key
    ----------------------------------*/
    const apiKey =
      process.env.GROQ_API_KEY ||
      process.env.NEXT_PUBLIC_GROQ_API_KEY ||
      process.env.GROQ ||
      process.env.GROQ_KEY;

    if (!apiKey || !apiKey.startsWith("gsk_")) {
      return Response.json(
        { content: "Missing GROQ_API_KEY", error: "invalid_key" },
        { status: 500 }
      );
    }

    const groq = createGroq({ apiKey: apiKey.trim() });

    /* ---------------------------------
       Load schema
    ----------------------------------*/
    let schema = await withRetry(() =>
      getTableSchema(actualTableName ?? undefined)
    );

    if (!schema || Object.keys(schema).length === 0) {
      const fallback = await findLatestTable();
      if (fallback) {
        actualTableName = fallback;
        schema = await getTableSchema(actualTableName);
      }
    }

    if (!schema || Object.keys(schema).length === 0) {
      return Response.json(
        { content: "No tables available.", error: "no_tables" },
        { status: 400 }
      );
    }

    /* ---------------------------------
       Prompt construction
    ----------------------------------*/
    const schemaContext = Object.entries(schema)
      .map(
        ([t, info]) => `Table: ${t}\nColumns: ${info.columns.join(", ")}`
      )
      .join("\n\n");

    const persisted = await getRecentMemory(session.id, 8);
    const recentInline = (history || []).slice(-3);

    const conversationHistory = [...persisted, ...recentInline]
      .map(
        (m: any) =>
          `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
      )
      .join("\n");

    const fullSystemPrompt = `${systemPrompt}

Database Schema:
${schemaContext}

${conversationHistory ? "Previous chat:\n" + conversationHistory : ""}
`;

    /* ---------------------------------
       RAG — Embedding
    ----------------------------------*/
    let questionEmbedding: number[] = [];

    try {
      questionEmbedding = await embedText(message);
    } catch {
      console.warn("[chat] embedding failed, skipping RAG");
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
       LLM — SQL generation
    ----------------------------------*/
    const llm = await generateText({
      model: groq("llama-3.1-8b-instant"),
      prompt: `${fullSystemPrompt}\n\nQuestion: ${message}`,
      temperature: 0.1,
    });

    let sqlQuery = llm.text
      .replace(/```sql/gi, "")
      .replace(/```/g, "")
      .trim();

    if (sqlQuery.endsWith(";")) sqlQuery = sqlQuery.slice(0, -1);

    const validation = validateSQL(sqlQuery);
    if (!validation.isValid) {
      return Response.json(
        {
          content: `SQL validation failed: ${validation.error}`,
          error: "validation_failed",
          sql: sqlQuery,
        },
        { status: 400 }
      );
    }

    /* ---------------------------------
       Execute SQL
    ----------------------------------*/
    const results: QueryResult[] = await withRetry(() =>
      executeQuery(sqlQuery)
    );

    /* ---------------------------------
       Summary
    ----------------------------------*/
    let summary = `Found ${results.length} rows.`;

    try {
      const s = await generateText({
        model: groq("llama-3.1-8b-instant"),
        prompt: `
Question: ${message}
SQL: ${sqlQuery}
Rows: ${results.length}
Sample: ${results[0] ? JSON.stringify(results[0]) : "none"}
`,
        temperature: 0.3,
      });
      summary = s.text;
    } catch {}

    await addMemory({
      sessionId: session.id,
      role: "assistant",
      content: summary,
      sql: sqlQuery,
    }).catch(() => {});

    /* ---------------------------------
       RAG — Store cache
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

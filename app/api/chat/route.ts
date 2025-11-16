export const runtime = "nodejs";

import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { getTableSchema, findLatestTable } from "@/lib/db";
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
  normalizeSql,
} from "@/lib/query-cache";

import type { TableSchema, QueryResult } from "@/lib/types";

export async function POST(req: Request) {
  console.log("🚀 /api/chat STARTED");

  try {
    await ensureRagSetup();

    const { message, history, tableName, sessionId } = await req.json();
    if (!message || !message.trim()) {
      return Response.json(
        { content: "Please provide a question.", error: "invalid_input" },
        { status: 400 }
      );
    }

    // ---------------------------
    // SESSION
    // ---------------------------
    let session = sessionId
      ? { id: sessionId, createdAt: Date.now() }
      : await getOrCreateSession();

    let actualTableName = tableName;

    await addMemory({
      sessionId: session.id,
      role: "user",
      content: message,
    }).catch(() => {});

    // ---------------------------
    // LOAD GROQ KEY
    // ---------------------------
    let apiKey =
      process.env.GROQ_API_KEY ||
      process.env.NEXT_PUBLIC_GROQ_API_KEY ||
      process.env.GROQ ||
      process.env.GROQ_KEY;

    if (!apiKey || !apiKey.startsWith("gsk_")) {
      return Response.json(
        {
          content: "Missing GROQ_API_KEY",
          error: "invalid_key",
        },
        { status: 500 }
      );
    }

    const groq = createGroq({ apiKey: apiKey.trim() });

    // ---------------------------
    // SCHEMA
    // ---------------------------
    let schema = await getTableSchema(actualTableName, session.id);

    if (!schema || Object.keys(schema).length === 0) {
      const fallback = await findLatestTable();
      if (fallback) {
        actualTableName = fallback;
        schema = await getTableSchema(actualTableName, session.id);
      }
    }

    if (!schema) {
      return Response.json(
        { content: "No tables available.", error: "no_tables" },
        { status: 400 }
      );
    }

    // ---------------------------
    // PROMPT
    // ---------------------------
    const schemaContext = Object.entries(schema)
      .map(([t, info]) => `Table: ${t}\nColumns: ${info.columns.join(", ")}`)
      .join("\n\n");

    const persisted = await getRecentMemory(session.id, 8);
    const recentInline = (history || []).slice(-3);

    const conversationHistory = [...persisted, ...recentInline]
      .map((m: any) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const fullSystemPrompt = `${systemPrompt}

Database Schema:
${schemaContext}

${conversationHistory ? "Previous chat:\n" + conversationHistory : ""}

`;

    // ---------------------------
    // RAG — EMBEDDING
    // ---------------------------
    console.log("🔍 Generating embedding...");
    let questionEmbedding = await embedText(message);

    if (!questionEmbedding || questionEmbedding.length === 0) {
      console.log("❌ No embedding generated. Skipping RAG.");
    } else {
      console.log("🔢 Embedding length:", questionEmbedding.length);
    }

    // ---------------------------
    // RAG — CACHE LOOKUP
    // ---------------------------
    if (questionEmbedding.length > 0) {
      console.log("🔎 Checking semantic cache...");

      const cacheHit = await findSimilarCachedQuery({
        sessionId: session.id,
        tableName: actualTableName,
        embedding: questionEmbedding,
      });

      if (cacheHit) {
        console.log("🎯 CACHE HIT! Similarity:", cacheHit.similarity);

        const results = await executeQuery(cacheHit.normalized_sql);

        return Response.json({
          content: `Cached result: found ${results.length} rows.`,
          sql: cacheHit.normalized_sql,
          results,
          fromCache: true,
        });
      } else {
        console.log("❌ No cache hit.");
      }
    }

    // ---------------------------
    // GROQ — GENERATE SQL
    // ---------------------------
    console.log("📡 Calling Groq LLM...");

    const llm = await generateText({
      model: groq("llama-3.1-8b-instant"),
      prompt: `${fullSystemPrompt}\n\nQuestion: ${message}`,
      temperature: 0.1,
    });

    let sqlQuery = llm.text.trim();
    sqlQuery = sqlQuery.replace(/```sql/gi, "").replace(/```/g, "").trim();
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

    // ---------------------------
    // EXECUTE SQL
    // ---------------------------
    const results = await executeQuery(sqlQuery);

    // ---------------------------
    // SUMMARY
    // ---------------------------
    const summaryPrompt = `
Write a short answer based on SQL results.

Question: ${message}
SQL: ${sqlQuery}
Rows: ${results.length}
Sample: ${results[0] ? JSON.stringify(results[0]) : "none"}
`;

    let summary;
    try {
      const s = await generateText({
        model: groq("llama-3.1-8b-instant"),
        prompt: summaryPrompt,
        temperature: 0.3,
      });
      summary = s.text;
    } catch {
      summary = `Found ${results.length} results.`;
    }

    await addMemory({
      sessionId: session.id,
      role: "assistant",
      content: summary,
      sql: sqlQuery,
    }).catch(() => {});

    // ---------------------------
    // RAG — STORE CACHE
    // ---------------------------
    if (questionEmbedding.length > 0) {
      console.log("💾 Storing query in cache...");
      await storeQueryInCache({
        sessionId: session.id,
        tableName: actualTableName,
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

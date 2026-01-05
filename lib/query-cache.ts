import { createClient } from "@supabase/supabase-js"
import type { QueryResult } from "@/lib/types"
import { safeVectorLiteral, safeSessionId, safeTableNameLiteral } from "@/lib/sql-escape"

// expected vector size
const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || "768")

function admin() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase URL or service role key is not configured")
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export function normalizeSql(sql: string): string {
  return sql
    .trim()
    .replace(/;\s*$/g, "") // remove trailing semicolon
    .replace(/\s+/g, " ")
}

interface CacheHit {
  id: number
  question: string
  normalized_sql: string
  result_sample: QueryResult[] | null
  row_count: number
  similarity: number
}

/**
 * ==========================================================
 * FIND SIMILAR QUERY IN CACHE
 * ==========================================================
 */
export async function findSimilarCachedQuery(params: {
  sessionId?: string
  tableName?: string | null
  embedding: number[]
  minSimilarity?: number
}): Promise<CacheHit | null> {

  const { sessionId, tableName, embedding } = params

  // 🔥 Lower threshold so queries actually match
  const minSim = params.minSimilarity ?? 0.70

  console.log("🔎 findSimilarCachedQuery() called")
  console.log("🔢 Embedding length:", embedding.length)

  if (!embedding.length) {
    console.log("❌ No embedding provided")
    return null
  }

  if (embedding.length !== EMBEDDING_DIM) {
    console.log("❌ Wrong embedding dimension", {
      got: embedding.length,
      expected: EMBEDDING_DIM,
    })
    return null
  }

  const supa = admin()

  // Safely construct pgvector literal for similarity search
  const vectorLiteral = safeVectorLiteral(embedding, EMBEDDING_DIM)

  // Safely construct WHERE clause filters using proper escaping
  const filters: string[] = []

  try {
    const safeSession = safeSessionId(sessionId ?? undefined)
    if (safeSession) {
      filters.push(`session_id = ${safeSession}`)
    }

    const safeTable = safeTableNameLiteral(tableName ?? undefined)
    if (safeTable) {
      filters.push(`table_name = ${safeTable}`)
    }
  } catch (error) {
    console.error("[query-cache] Invalid sessionId or tableName:", error)
    return null
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : ""

  const sql = `
    SELECT
      id,
      question,
      normalized_sql,
      result_sample,
      row_count,
      1 - (question_embedding <=> ${vectorLiteral}) AS similarity
    FROM conversation_query_cache
    ${whereClause}
    ORDER BY question_embedding <-> ${vectorLiteral}
    LIMIT 1
  `

  // SHOW SQL FOR DEBUGGING
  console.log("📄 Cache search SQL:\n", sql)

  const { data, error } = await supa.rpc("execute_raw_sql", { sql_query: sql })

  if (error) {
    console.warn("❌ query_cache search error:", error)
    return null
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.log("❌ Cache search: no rows found")
    return null
  }

  const row = data[0] as any

  console.log("📊 Cache search similarity:", row.similarity)

  if (row.similarity < minSim) {
    console.log("❌ Cache miss: similarity below threshold", {
      similarity: row.similarity,
      minSim,
    })
    return null
  }

  console.log("🎉 CACHE HIT!", row)

  return {
    id: row.id,
    question: row.question,
    normalized_sql: row.normalized_sql,
    result_sample: row.result_sample ?? null,
    row_count: row.row_count ?? 0,
    similarity: row.similarity,
  }
}

/**
 * ==========================================================
 * INSERT NEW QUERY IN CACHE
 * ==========================================================
 */
export async function storeQueryInCache(params: {
  sessionId?: string
  tableName?: string | null
  question: string
  sql: string
  results: QueryResult[]
  embedding: number[]
}) {
  const supa = admin()

  console.log("💾 Attempting to insert into cache...")

  if (!params.embedding || params.embedding.length === 0) {
    console.warn("❌ Skipping insert: empty embedding")
    return
  }

  if (params.embedding.length !== EMBEDDING_DIM) {
    console.warn("❌ Skipping insert: invalid embedding dimension", {
      got: params.embedding.length,
      expected: EMBEDDING_DIM,
    })
    return
  }

  const rowCount = params.results?.length ?? 0
  const sample = params.results?.slice(0, 100) ?? []

  const payload = {
    session_id: params.sessionId ?? null,
    table_name: params.tableName ?? null,
    question: params.question,
    normalized_sql: normalizeSql(params.sql),
    result_sample: sample,
    row_count: rowCount,
    question_embedding: params.embedding,
  }

  const { error } = await supa.from("conversation_query_cache").insert(payload)

  if (error) {
    console.warn("❌ query_cache insert error:", error)
  } else {
    console.log("✅ Query saved to cache (conversation_query_cache)")
  }
}

import { createClient } from "@supabase/supabase-js"

/**
 * Ensures RAG setup runs only once per server lifecycle
 */
let ragSetupPromise: Promise<void> | null = null

/**
 * Create admin Supabase client (service role)
 */
function admin() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase URL or service role key is not configured")
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || "768")

/**
 * Small sleep helper
 */
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry wrapper for cold starts / transient Supabase failures
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 2000
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (retries <= 0) throw err
    console.warn(`[setup] retrying after failure (${retries} left)`)
    await sleep(delayMs)
    return withRetry(fn, retries - 1, delayMs)
  }
}

/**
 * Executes DDL safely using RPC
 */
async function runDDL(statement: string) {
  const supa = admin()

  await withRetry(async () => {
    const { error } = await supa.rpc("execute_ddl", {
      ddl_statement: statement,
    })

    if (error) {
      console.error("[setup] DDL error:", error)
      throw error
    }
  })
}

/**
 * One-time RAG + DB setup
 * Safe against:
 * - Supabase cold starts
 * - Auto pause / resume
 * - App restarts
 */
export async function ensureRagSetup() {
  if (ragSetupPromise) return ragSetupPromise

  ragSetupPromise = (async () => {
    console.log("[setup] Ensuring Supabase RAG setup...")

    const supa = admin()

    /* ---------------------------------
       🔥 DATABASE WARM-UP (FIXED)
       --------------------------------- */
    await withRetry(async () => {
      const { error } = await supa.rpc("execute_raw_sql", {
        sql_query: "SELECT 1",
      })

      if (error) {
        console.warn("[setup] DB warmup failed, retrying...")
        throw error
      }
    })

    /* ---------------------------------
       Extensions
       --------------------------------- */
    await runDDL(`
      CREATE EXTENSION IF NOT EXISTS vector;
    `)

    /* ---------------------------------
       Conversation memory
       --------------------------------- */
    await runDDL(`
      CREATE TABLE IF NOT EXISTS public.conversation_memory (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        sql TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)

    await runDDL(`
      CREATE INDEX IF NOT EXISTS idx_conversation_memory_session_created_at
      ON public.conversation_memory (session_id, created_at DESC);
    `)

    /* ---------------------------------
       Query cache (RAG)
       --------------------------------- */
    await runDDL(`
      CREATE TABLE IF NOT EXISTS public.query_cache (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT,
        table_name TEXT,
        question TEXT NOT NULL,
        normalized_sql TEXT NOT NULL,
        result_sample JSONB,
        row_count INTEGER NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        question_embedding VECTOR(${EMBEDDING_DIM}) NOT NULL
      );
    `)

    await runDDL(`
      CREATE INDEX IF NOT EXISTS idx_query_cache_embedding
      ON public.query_cache
      USING ivfflat (question_embedding vector_cosine_ops)
      WITH (lists = 100);
    `)

    await runDDL(`
      CREATE INDEX IF NOT EXISTS idx_query_cache_session_table
      ON public.query_cache (session_id, table_name, created_at DESC);
    `)

    console.log("[setup] Supabase RAG setup complete")
  })()

  return ragSetupPromise
}

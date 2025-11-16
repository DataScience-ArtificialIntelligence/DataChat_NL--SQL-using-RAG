import { createClient } from "@supabase/supabase-js"

let ragSetupPromise: Promise<void> | null = null

function admin() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase URL or service role key is not configured")
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || "768")

async function runDDL(statement: string) {
  const supa = admin()

  try {
    const { error } = await supa.rpc("execute_ddl", { ddl_statement: statement })
    if (error) {
      console.error("[v0] RAG setup DDL error:", error)
    }
  } catch (err) {
    console.error("[v0] RAG setup RPC failed:", err)
  }
}

export async function ensureRagSetup() {
  if (ragSetupPromise) return ragSetupPromise

  ragSetupPromise = (async () => {
    console.log("[v0] Ensuring Supabase RAG setup...")

    // Enable pgvector extension
    await runDDL("CREATE EXTENSION IF NOT EXISTS vector;")

    // Base conversation memory table (used by lib/memory.ts)
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

    // Semantic query cache table for RAG / frequent queries
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

    console.log("[v0] Supabase RAG setup complete")
  })()

  return ragSetupPromise
}


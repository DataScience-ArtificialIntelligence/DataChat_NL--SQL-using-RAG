import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { safeTableNameLiteral } from "@/lib/sql-escape"

let supabaseInstance: ReturnType<typeof createServerClient> | null = null
let dbReady = false

/* -------------------------------------------------
   Utils
--------------------------------------------------*/

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 2000
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (retries <= 0) throw err
    console.warn(`[db] retrying after failure (${retries} left)`)
    await sleep(delayMs)
    return withRetry(fn, retries - 1, delayMs)
  }
}

/* -------------------------------------------------
   Supabase client
--------------------------------------------------*/

export async function getSupabase() {
  if (supabaseInstance) return supabaseInstance

  const cookieStore = await cookies()

  supabaseInstance = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // ignore cookie write errors
          }
        },
      },
    }
  )

  return supabaseInstance
}

/* -------------------------------------------------
   DB warmup (cold start fix)
--------------------------------------------------*/

export async function ensureDbReady() {
  if (dbReady) return

  const supabase = await getSupabase()

  await withRetry(async () => {
    const { error } = await supabase.rpc("execute_raw_sql", {
      sql_query: "SELECT 1",
    })

    if (error) {
      console.warn("[db] warmup failed, retrying...")
      throw error
    }
  })

  dbReady = true
  console.log("[db] database ready")
}

/* -------------------------------------------------
   Schema discovery (FIXED)
--------------------------------------------------*/

export async function getTableSchema(tableName?: string) {
  const supabase = await getSupabase()
  await ensureDbReady()

  try {
    let schemaQuery = `
      SELECT 
        table_name,
        array_agg(json_build_object(
          'name', column_name,
          'dataType', data_type,
          'description', 'Column ' || column_name || ' of type ' || data_type
        ) ORDER BY ordinal_position) AS columns
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name LIKE 'session_%'
        AND table_name NOT IN ('spatial_ref_sys')
    `

    // 🔥 IMPORTANT FIX:
    // DO NOT filter by sessionId (caused false no_tables)
    if (tableName) {
      try {
        const safeTable = safeTableNameLiteral(tableName)
        if (safeTable) {
          schemaQuery += ` AND table_name = ${safeTable}`
        }
      } catch (error) {
        console.error("[db] Invalid tableName in getTableSchema:", error)
        // If table name is invalid, return empty schema rather than throwing
        return {}
      }
    }

    schemaQuery += ` GROUP BY table_name ORDER BY table_name DESC`

    const rpcResult = await withRetry(() =>
      supabase.rpc("execute_raw_sql", { sql_query: schemaQuery })
    )
    const { data, error } = rpcResult as { data: unknown; error: unknown }

    if (error || !Array.isArray(data)) {
      console.warn("[db] schema RPC failed, using fallback")
      return await fallbackSchemaFetch(supabase)
    }

    const result: Record<string, any> = {}

    data.forEach((row: any) => {
      result[row.table_name] = {
        columns: row.columns || [],
        description: "User uploaded data table",
      }
    })

    return result
  } catch (err) {
    console.error("[db] schema fetch error:", err)
    return {}
  }
}

/* -------------------------------------------------
   Fallback schema discovery
--------------------------------------------------*/

async function fallbackSchemaFetch(supabase: any) {
  const { data: tables, error } = await supabase
    .from("pg_tables")
    .select("tablename")
    .eq("schemaname", "public")
    .like("tablename", "session_%")

  if (error || !Array.isArray(tables)) {
    console.error("[db] fallback schema fetch failed:", error)
    return {}
  }

  const result: Record<string, any> = {}

  for (const table of tables) {
    const { data: columns } = await supabase
      .from("information_schema.columns")
      .select("column_name, ordinal_position")
      .eq("table_schema", "public")
      .eq("table_name", table.tablename)
      .order("ordinal_position")

    result[table.tablename] = {
      columns: columns?.map((c: any) => c.column_name) || [],
      description: "User uploaded data table",
    }
  }

  return result
}

/* -------------------------------------------------
   Find latest uploaded table
--------------------------------------------------*/

export async function findLatestTable(): Promise<string | null> {
  const supabase = await getSupabase()
  await ensureDbReady()

  try {
    const rpcResult = await withRetry(() =>
      supabase.rpc("execute_raw_sql", {
        sql_query: `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name LIKE 'session_%'
          ORDER BY table_name DESC
          LIMIT 1
        `,
      })
    )
    const { data, error } = rpcResult as { data: unknown; error: unknown }

    if (error || !Array.isArray(data) || data.length === 0) {
      return null
    }

    return data[0].table_name
  } catch (err) {
    console.error("[db] findLatestTable error:", err)
    return null
  }
}

/* -------------------------------------------------
   Reload PostgREST schema cache
--------------------------------------------------*/

export async function reloadSchemaCache(): Promise<boolean> {
  const supabase = await getSupabase()
  await ensureDbReady()

  try {
    const { error } = await supabase.rpc("execute_raw_sql", {
      sql_query: "SELECT pg_notify('pgrst', 'reload schema')",
    })

    if (!error) {
      console.log("[db] schema cache reload triggered")
      return true
    }

    console.warn("[db] schema reload RPC failed")
    return false
  } catch (err) {
    console.error("[db] schema reload error:", err)
    return false
  }
}

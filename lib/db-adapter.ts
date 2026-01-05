import { neon } from "@neondatabase/serverless"
import { createClient } from "@supabase/supabase-js"
import type { TableSchema } from "@/lib/types"
import { validateSessionId, safeTableNameLiteral } from "@/lib/sql-escape"

export interface DatabaseAdapter {
  query<T = any>(sql: string): Promise<T[]>
  explain(sql: string): Promise<any>
  getSchema(params?: { sessionId?: string; tableName?: string }): Promise<TableSchema>
}

let cachedAdapter: DatabaseAdapter | null = null

function hasNeon(): boolean {
  return !!process.env.POSTGRES_URL
}

function hasSupabase(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
}

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

class NeonPostgresAdapter implements DatabaseAdapter {
  private sql: ReturnType<typeof neon>

  constructor() {
    this.sql = neon(process.env.POSTGRES_URL!)
  }

  async query<T = any>(sqlText: string): Promise<T[]> {
    const rows = (await this.sql.unsafe(sqlText)) as unknown
    return Array.isArray(rows) ? (rows as T[]) : []
  }

  async explain(sqlText: string): Promise<any> {
    const rows = (await this.sql.unsafe(`EXPLAIN (FORMAT JSON) ${sqlText}`)) as unknown
    const rowsArray = Array.isArray(rows) ? rows : [rows]
    const planRow = rowsArray?.[0]
    const key = Object.keys(planRow || {}).find((k) => k.toLowerCase().includes("query plan"))
    return key ? planRow[key] : rows
  }

  async getSchema(params?: { sessionId?: string; tableName?: string }): Promise<TableSchema> {
    const filters: string[] = [
      `table_schema = 'public'`,
      `table_name LIKE 'session_%'`,
      `table_name NOT IN ('spatial_ref_sys')`,
    ]
    try {
      if (params?.sessionId) {
        // Validate sessionId - if valid, it only contains safe characters (alphanumeric, underscore, hyphen)
        // so it's safe to use directly in LIKE pattern
        if (validateSessionId(params.sessionId)) {
          // Escape single quotes for SQL string literal (though sessionId shouldn't contain quotes after validation)
          const escapedSession = params.sessionId.replace(/'/g, "''")
          filters.push(`table_name LIKE 'session_${escapedSession}_%'`)
        } else {
          console.warn("[db-adapter] Invalid sessionId format, skipping filter")
        }
      }
      if (params?.tableName) {
        const safeTable = safeTableNameLiteral(params.tableName)
        if (safeTable) {
          filters.push(`table_name = ${safeTable}`)
        }
      }
    } catch (error) {
      console.error("[db-adapter] Error processing sessionId or tableName in getSchema:", error)
      // Continue without filters if validation fails
    }

    const query = `
      SELECT 
        c.table_name,
        array_agg(c.column_name ORDER BY c.ordinal_position) as columns
      FROM information_schema.columns c
      WHERE ${filters.join(" AND ")}
      GROUP BY c.table_name
      ORDER BY c.table_name DESC
    `
    const rows = await this.query<{ table_name: string; columns: string[] }>(query)
    const result: TableSchema = {}
    for (const r of rows) {
      result[r.table_name] = {
        columns: r.columns || [],
        description: "User uploaded data table",
      }
    }
    return result
  }
}

class SupabasePostgresAdapter implements DatabaseAdapter {
  private admin = getSupabaseAdmin()

  async query<T = any>(sqlText: string): Promise<T[]> {
    // Prefer execute_raw_sql RPC if available
    const { data, error } = await this.admin.rpc("execute_raw_sql", { sql_query: sqlText })
    if (error) {
      // Fallback: wrap in json_agg via "query" function if present
      const wrapped = `SELECT json_agg(t) as result FROM (${sqlText}) t`
      const { data: rawData, error: rawErr } = await this.admin.rpc("query", { query_text: wrapped })
      if (rawErr) throw rawErr
      return rawData?.result || []
    }
    return Array.isArray(data) ? (data as T[]) : []
  }

  async explain(sqlText: string): Promise<any> {
    const { data, error } = await this.admin.rpc("execute_raw_sql", {
      sql_query: `EXPLAIN (FORMAT JSON) ${sqlText}`,
    })
    if (error) throw error
    // data is an array of rows; PostgREST returns JSON as text in "QUERY PLAN" key
    const row = Array.isArray(data) ? data[0] : null
    const key = row ? Object.keys(row).find((k) => k.toLowerCase().includes("query plan")) : null
    return key ? row[key] : data
  }

  async getSchema(params?: { sessionId?: string; tableName?: string }): Promise<TableSchema> {
    let schemaQuery = `
      SELECT 
        table_name,
        array_agg(column_name ORDER BY ordinal_position) as columns
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name LIKE 'session_%'
        AND table_name NOT IN ('spatial_ref_sys')
    `
    try {
      if (params?.sessionId) {
        // Validate sessionId - if valid, it only contains safe characters (alphanumeric, underscore, hyphen)
        // so it's safe to use directly in LIKE pattern
        if (validateSessionId(params.sessionId)) {
          // Escape single quotes for SQL string literal (though sessionId shouldn't contain quotes after validation)
          const escapedSession = params.sessionId.replace(/'/g, "''")
          schemaQuery += ` AND table_name LIKE 'session_${escapedSession}_%'`
        } else {
          console.warn("[db-adapter] Invalid sessionId format, skipping filter")
        }
      }
      if (params?.tableName) {
        const safeTable = safeTableNameLiteral(params.tableName)
        if (safeTable) {
          schemaQuery += ` AND table_name = ${safeTable}`
        }
      }
    } catch (error) {
      console.error("[db-adapter] Error processing sessionId or tableName in getSchema:", error)
      // Continue without filters if validation fails
    }
    schemaQuery += ` GROUP BY table_name ORDER BY table_name DESC`

    const { data, error } = await this.admin.rpc("execute_raw_sql", { sql_query: schemaQuery })
    if (error) {
      // Fallback: pg_tables then info_schema per-table
      const { data: tables, error: tablesError } = await this.admin
        .from("pg_tables")
        .select("tablename")
        .eq("schemaname", "public")
        .like("tablename", "session_%")
      if (tablesError) return {}
      const result: TableSchema = {}
      if (Array.isArray(tables)) {
        for (const t of tables) {
          const { data: columns } = await this.admin
            // @ts-ignore: information_schema available via PostgREST
            .from("information_schema.columns")
            .select("column_name, ordinal_position")
            .eq("table_schema", "public")
            .eq("table_name", t.tablename)
            .order("ordinal_position")
          result[t.tablename] = {
            columns: (columns || []).map((c: any) => c.column_name),
            description: "User uploaded data table",
          }
        }
      }
      return result
    }

    const result: TableSchema = {}
    if (Array.isArray(data)) {
      data.forEach((row: any) => {
        result[row.table_name] = {
          columns: row.columns || [],
          description: "User uploaded data table",
        }
      })
    }
    return result
  }
}

export function getDbAdapter(): DatabaseAdapter {
  if (cachedAdapter) return cachedAdapter

  // Allow explicit override: set V0_DB_ADAPTER=neon to force Neon usage
  const override = (process.env.V0_DB_ADAPTER || process.env.DB_ADAPTER || "").toLowerCase()

  if (override === "neon" && hasNeon()) {
    console.log("[v0] DB adapter: Neon (override)")
    cachedAdapter = new NeonPostgresAdapter()
    return cachedAdapter
  }

  if (hasSupabase()) {
    console.log("[v0] DB adapter: Supabase (default)")
    cachedAdapter = new SupabasePostgresAdapter()
    return cachedAdapter
  }

  if (hasNeon()) {
    console.log("[v0] DB adapter: Neon (fallback)")
    cachedAdapter = new NeonPostgresAdapter()
    return cachedAdapter
  }

  // Final fallback: throw to surface misconfiguration early
  console.error(
    "[v0] No database adapter available. Provide NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or POSTGRES_URL",
  )
  throw new Error("Database not configured")
}

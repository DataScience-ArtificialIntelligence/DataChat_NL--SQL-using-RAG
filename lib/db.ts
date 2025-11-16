import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

let supabaseInstance: ReturnType<typeof createServerClient> | null = null

export async function getSupabase() {
  if (supabaseInstance) {
    return supabaseInstance
  }

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
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Handle cookie setting errors
          }
        },
      },
    },
  )

  return supabaseInstance
}

export async function getTableSchema(tableName?: string, sessionId?: string) {
  const supabase = await getSupabase()

  try {
    let schemaQuery = `
      SELECT 
        table_name,
        array_agg(column_name ORDER BY ordinal_position) as columns
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name LIKE 'session_%'
        AND table_name NOT IN ('spatial_ref_sys')
    `

    if (sessionId) {
      schemaQuery += ` AND table_name LIKE 'session_${sessionId}_%'`
    }

    if (tableName) {
      schemaQuery += ` AND table_name = '${tableName}'`
    }

    schemaQuery += ` GROUP BY table_name ORDER BY table_name DESC`

    let schemaData: any = null
    let schemaError: any = null

    try {
      const result = await supabase.rpc("execute_raw_sql", {
        sql_query: schemaQuery,
      })
      schemaData = result.data
      schemaError = result.error
    } catch (e) {
      console.log("[v0] execute_raw_sql not available, using direct query")
      schemaError = e
    }

    if (schemaError) {
      console.log("[v0] Using fallback schema query method")

      const { data: tables, error: tablesError } = await supabase
        .from("pg_tables")
        .select("tablename")
        .eq("schemaname", "public")
        .like("tablename", "session_%")

      if (tablesError) {
        console.error("[v0] Fallback query also failed:", tablesError)
        return {}
      }

      const result: any = {}
      if (Array.isArray(tables)) {
        for (const table of tables) {
          // Get columns for each table using information_schema
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
      }

      return result
    }

    const result: any = {}
    if (Array.isArray(schemaData)) {
      schemaData.forEach((table: any) => {
        result[table.table_name] = {
          columns: table.columns || [],
          description: "User uploaded data table",
        }
      })
    }

    console.log("[v0] Found tables:", Object.keys(result))
    return result
  } catch (error) {
    console.error("[v0] Schema fetch error:", error)
    return {}
  }
}

export async function findLatestTable(): Promise<string | null> {
  const supabase = await getSupabase()

  try {
    const { data, error } = await supabase.rpc("execute_raw_sql", {
      sql_query: `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name LIKE 'session_%'
        ORDER BY table_name DESC 
        LIMIT 1
      `,
    })

    if (error || !data || !Array.isArray(data) || data.length === 0) {
      return null
    }

    return data[0].table_name
  } catch (error) {
    console.error("[v0] Error finding latest table:", error)
    return null
  }
}

export async function reloadSchemaCache(): Promise<boolean> {
  const supabase = await getSupabase()

  try {
    console.log("[v0] Attempting to reload PostgREST schema cache...")

    // Method 1: Using execute_raw_sql if available
    try {
      const { error } = await supabase.rpc("execute_raw_sql", {
        sql_query: "SELECT pg_notify('pgrst', 'reload schema')",
      })

      if (!error) {
        console.log("[v0] Schema cache reload signal sent via execute_raw_sql")
        return true
      }
    } catch (e) {
      console.log("[v0] Method 1 failed, trying direct REST API")
    }

    // Method 2: Direct REST API call
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/pg_notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        },
        body: JSON.stringify({
          channel: "pgrst",
          payload: "reload schema",
        }),
      })

      if (response.ok) {
        console.log("[v0] Schema cache reload signal sent via REST API")
        return true
      }
    } catch (e) {
      console.log("[v0] Method 2 failed")
    }

    console.log("[v0] All schema reload methods failed")
    return false
  } catch (error) {
    console.error("[v0] Error reloading schema cache:", error)
    return false
  }
}

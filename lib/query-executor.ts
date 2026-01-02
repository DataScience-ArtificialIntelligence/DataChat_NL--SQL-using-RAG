import { getOrCreateSession } from "@/lib/session"
import type { PostgrestError } from "@supabase/supabase-js"
import { getDbAdapter } from "@/lib/db-adapter"

export class QueryExecutionError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: string,
    public hint?: string,
  ) {
    super(message)
    this.name = "QueryExecutionError"
  }
}

export async function executeQuery(sql: string, skipSessionValidation = false) {
  const session = await getOrCreateSession()
  const adapter = getDbAdapter()

  console.log("[v0] Executing query via adapter:", sql)

  try {
    if (!skipSessionValidation) {
      const validationResult = validateSessionAccess(sql, session.id)
      if (!validationResult.isValid) {
        console.warn("[v0] Session validation warning:", validationResult.error)
      }
    }

    const results = await adapter.query(sql)
    const MAX_RESULTS = 1000
    if (results.length > MAX_RESULTS) {
      console.warn(`[v0] Query returned ${results.length} rows, limiting to ${MAX_RESULTS}`)
      return results.slice(0, MAX_RESULTS)
    }
    console.log(`[v0] Query succeeded, returned ${results.length} rows`)
    return results
  } catch (error: any) {
    console.error("[v0] Query execution failed:", error)
    return handleQueryError(error, sql)
  }
}

export async function explainQuery(sql: string) {
  const adapter = getDbAdapter()
  try {
    return await adapter.explain(sql)
  } catch (err: any) {
    throw new QueryExecutionError(
      "Explain plan failed",
      err?.code || "EXPLAIN_ERROR",
      err?.message || String(err),
      "Ensure the SQL is a valid SELECT and try again",
    )
  }
}

async function handleQueryError(error: any, sql: string): Promise<never> {
  const code = error?.code
  const msg = error?.message || error?.toString?.() || "Query execution failed"
  const details = error?.details
  const hint = error?.hint

  switch (code) {
    case "42P01": {
      const tableMatch = msg?.match(/relation "?([^"]+)"? does not exist/i)
      const missingTable = tableMatch ? tableMatch[1] : "unknown"
      throw new QueryExecutionError(
        `Table '${missingTable}' not found`,
        "42P01",
        "The table you're trying to query doesn't exist in the database",
        "Upload a CSV file first, or check that you're using the correct table name from your current session",
      )
    }
    case "42703": {
      const columnMatch = msg?.match(/column "?([^"]+)"? does not exist/i)
      const missingColumn = columnMatch ? columnMatch[1] : "unknown"
      throw new QueryExecutionError(
        `Column '${missingColumn}' not found`,
        "42703",
        "The column you're trying to access doesn't exist in the table",
        "Check the available columns in the Schema tab, or try rephrasing your question",
      )
    }
    case "42601":
      throw new QueryExecutionError(
        "SQL syntax error in generated query",
        "42601",
        msg,
        "Try rephrasing your question more clearly, or ask for a simpler query",
      )
    case "42501":
      throw new QueryExecutionError(
        "Permission denied",
        "42501",
        details || msg,
        "Check your RLS policies and privileges",
      )
    case "PGRST202":
      // PostgREST schema cache errors when RPC functions are missing
      throw new QueryExecutionError(
        "Database RPC function not found (PostgREST schema cache)",
        "PGRST202",
        details || msg,
        "Ensure you ran the database setup scripts (scripts/01-setup-database-functions.sql) and reloaded the schema cache (scripts/02-reload-schema-cache.sql) in your Supabase project",
      )
    default:
      // Supabase PostgREST error object compatibility
      const pgErr = error as PostgrestError
      throw new QueryExecutionError(
        msg || "Query execution failed",
        code || pgErr?.code || "UNKNOWN",
        details || pgErr?.details || "No additional details available",
        hint || pgErr?.hint || "Try rephrasing your question or check the Schema tab",
      )
  }
}

function validateSessionAccess(sql: string, sessionId: string): { isValid: boolean; error?: string } {
  try {
    const tableRegex = /(?:FROM|JOIN)\s+["']?(session_[a-zA-Z0-9_]+)["']?/gi
    const matches = Array.from(sql.matchAll(tableRegex))
    if (matches.length === 0) return { isValid: true }
    for (const match of matches) {
      const tableName = match[1]
      if (!tableName.startsWith(`session_${sessionId}_`)) {
        return {
          isValid: false,
          error: `Accessing table '${tableName}' from a different session (current: session_${sessionId}_*)`,
        }
      }
    }
    return { isValid: true }
  } catch (error) {
    console.error("[v0] Error validating session access:", error)
    return { isValid: true }
  }
}

export interface ValidationResult {
  isValid: boolean
  error?: string
}

const DANGEROUS_KEYWORDS = [
  "DROP",
  "DELETE",
  "TRUNCATE",
  "ALTER",
  "CREATE",
  "INSERT",
  "UPDATE",
  "GRANT",
  "REVOKE",
  "EXEC",
  "EXECUTE",
  "CALL",
  "MERGE",
  "REPLACE",
  "LOAD",
  "IMPORT",
  "EXPORT",
  "BACKUP",
  "RESTORE",
  "SHUTDOWN",
  "KILL",
]

const DANGEROUS_FUNCTIONS = ["PG_READ_FILE", "PG_WRITE_FILE", "PG_EXECUTE", "COPY", "\\COPY"]

const INJECTION_PATTERNS = [
  /;\s*(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|GRANT|REVOKE)/i,
  /UNION\s+(ALL\s+)?SELECT/i,
  /--[^\r\n]*/,
  /\/\*[\s\S]*?\*\//,
  /\bxp_\w+/i,
  /\bsp_\w+/i,
  /'[^']*'[^']*'/, // Potential quote escaping
  /\\\w+/, // Escape sequences
  /\bCHR\s*\(/i, // Character injection
  /\bCONCAT\s*\(/i, // String concatenation attacks
]

export function validateSQL(sql: string): ValidationResult {
  if (!sql || typeof sql !== "string") {
    return {
      isValid: false,
      error: "Query is empty or invalid",
    }
  }

  const trimmedSQL = sql.trim()
  if (!trimmedSQL) {
    return {
      isValid: false,
      error: "Query is empty",
    }
  }

  const upperSQL = trimmedSQL.toUpperCase()

  // Must start with SELECT (case insensitive)
  if (!upperSQL.startsWith("SELECT")) {
    return {
      isValid: false,
      error: "Only SELECT queries are allowed",
    }
  }

  // Check for dangerous keywords
  for (const keyword of DANGEROUS_KEYWORDS) {
    // Use word boundaries to avoid false positives
    const keywordRegex = new RegExp(`\\b${keyword}\\b`, "i")
    if (keywordRegex.test(sql)) {
      return {
        isValid: false,
        error: `Query contains forbidden keyword: ${keyword}`,
      }
    }
  }

  // Check for dangerous functions
  for (const func of DANGEROUS_FUNCTIONS) {
    const funcRegex = new RegExp(`\\b${func}\\s*\\(`, "i")
    if (funcRegex.test(sql)) {
      return {
        isValid: false,
        error: `Query contains forbidden function: ${func}`,
      }
    }
  }

  // Check for SQL injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(sql)) {
      return {
        isValid: false,
        error: "Query contains potentially dangerous patterns",
      }
    }
  }

  // Check for multiple statements (more robust)
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  if (statements.length > 1) {
    return {
      isValid: false,
      error: "Multiple statements are not allowed",
    }
  }

  // Check for nested queries that might bypass validation
  const nestedSelectCount = (sql.match(/SELECT/gi) || []).length
  if (nestedSelectCount > 3) {
    return {
      isValid: false,
      error: "Too many nested SELECT statements",
    }
  }

  // Check for excessively long queries (potential DoS)
  if (sql.length > 10000) {
    return {
      isValid: false,
      error: "Query is too long",
    }
  }

  // Validate parentheses are balanced
  let parenCount = 0
  for (const char of sql) {
    if (char === "(") parenCount++
    if (char === ")") parenCount--
    if (parenCount < 0) {
      return {
        isValid: false,
        error: "Unbalanced parentheses in query",
      }
    }
  }

  if (parenCount !== 0) {
    return {
      isValid: false,
      error: "Unbalanced parentheses in query",
    }
  }

  // Check for suspicious quote patterns
  const singleQuotes = (sql.match(/'/g) || []).length
  if (singleQuotes % 2 !== 0) {
    return {
      isValid: false,
      error: "Unmatched quotes in query",
    }
  }

  // Ensure query targets session tables only
  const tableTargets: Array<{ schema?: string; table: string }> = []
  const fromJoinRegex = /(?:FROM|JOIN)\s+(?:"?([a-z0-9_]+)"?\.)?(?:"?([a-z0-9_]+)"?)/gi
  let match: RegExpExecArray | null
  while ((match = fromJoinRegex.exec(sql)) !== null) {
    const schema = match[1]?.toLowerCase()
    const table = match[2]?.toLowerCase()
    if (table) {
      tableTargets.push({ schema, table })
    }
  }

  if (tableTargets.length > 0) {
    for (const target of tableTargets) {
      const schema = target.schema
      const tableName = target.table

      // Allow system schemas explicitly (schema-qualified)
      if (schema === "information_schema" || schema === "pg_catalog") {
        continue
      }

      // Allow references written without schema if they are system catalogs
      if (tableName === "information_schema" || tableName === "pg_catalog") {
        continue
      }

      // Enforce session table access for user data
      if (!tableName.startsWith("session_")) {
        const qualified = schema ? `${schema}.${tableName}` : tableName
        return {
          isValid: false,
          error: `Can only query user session tables (found: ${qualified})`,
        }
      }
    }
  }

  return { isValid: true }
}

export function sanitizeTableName(tableName: string): string {
  return tableName
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toLowerCase()
    .slice(0, 63) // PostgreSQL limit
}

export function sanitizeColumnName(columnName: string): string {
  return columnName
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toLowerCase()
    .slice(0, 63) // PostgreSQL limit
}

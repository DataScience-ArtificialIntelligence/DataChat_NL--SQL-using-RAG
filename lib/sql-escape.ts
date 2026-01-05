/**
 * SQL Escaping Utilities
 * 
 * Provides safe functions to escape SQL identifiers and literals
 * to prevent SQL injection attacks.
 */

/**
 * Validates that a string contains only safe characters for SQL identifiers
 * (alphanumeric, underscore, and hyphen)
 */
export function validateIdentifier(value: string, maxLength: number = 63): boolean {
  if (!value || typeof value !== "string") return false
  if (value.length > maxLength) return false
  // Allow alphanumeric, underscore, and hyphen (for table names like session_xxx-yyy)
  return /^[a-zA-Z0-9_-]+$/.test(value)
}

/**
 * Validates that a string is a valid session ID (nanoid generates URL-safe alphanumeric)
 */
export function validateSessionId(value: string): boolean {
  if (!value || typeof value !== "string") return false
  // nanoid generates URL-safe alphanumeric (A-Za-z0-9_-), typically 12 chars
  if (value.length > 64) return false // reasonable max length
  return /^[a-zA-Z0-9_-]+$/.test(value)
}

/**
 * Safely escapes a SQL identifier (table name, column name) using PostgreSQL's quote_ident
 * This function validates the identifier and constructs a safe SQL fragment.
 * 
 * Since we can't use quote_ident() directly from JS, we validate and manually quote.
 * Only valid identifiers (alphanumeric, underscore, hyphen) are allowed.
 */
export function escapeIdentifier(identifier: string): string {
  if (!validateIdentifier(identifier)) {
    throw new Error(`Invalid identifier: ${identifier}`)
  }
  // Double quote identifiers that need it, otherwise return as-is
  // PostgreSQL identifiers are case-insensitive unless quoted
  return `"${identifier.replace(/"/g, '""')}"`
}

/**
 * Safely escapes a SQL string literal using PostgreSQL's quote_literal
 * This function validates and escapes string values to prevent SQL injection.
 * 
 * Since we can't use quote_literal() directly from JS, we escape manually.
 */
export function escapeLiteral(value: string): string {
  if (value === null || value === undefined) {
    return "NULL"
  }
  if (typeof value !== "string") {
    throw new Error(`Expected string, got ${typeof value}`)
  }
  // Escape single quotes by doubling them
  // Wrap in single quotes
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Validates and escapes a table name as a string literal for use in WHERE clauses
 * Ensures the table name matches the expected pattern (session_*)
 * Use this when comparing table_name column values in WHERE clauses
 */
export function safeTableNameLiteral(tableName: string | null | undefined): string | null {
  if (!tableName) return null
  
  // Validate it's a valid identifier
  if (!validateIdentifier(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`)
  }
  
  // Additional validation: should start with session_ for user tables
  // Allow information_schema and pg_catalog for schema queries
  if (!tableName.startsWith("session_") && 
      !tableName.startsWith("information_schema.") && 
      !tableName.startsWith("pg_catalog.")) {
    // For cache queries, we're comparing against stored table names
    // So we allow any valid identifier, but log a warning for non-session tables
    console.warn(`[sql-escape] Table name doesn't start with session_: ${tableName}`)
  }
  
  // Escape as a string literal since we're comparing column values
  return escapeLiteral(tableName)
}

/**
 * Validates and escapes a table name as an identifier for use in FROM/JOIN clauses
 * Ensures the table name matches the expected pattern (session_*)
 * Use this when referencing table names directly in SQL
 */
export function safeTableNameIdentifier(tableName: string | null | undefined): string | null {
  if (!tableName) return null
  
  // Validate it's a valid identifier
  if (!validateIdentifier(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`)
  }
  
  // Additional validation: should start with session_ for user tables
  if (!tableName.startsWith("session_")) {
    // For information_schema queries, we might allow other patterns
    // But for safety, we'll be strict
    if (!tableName.startsWith("information_schema.") && 
        !tableName.startsWith("pg_catalog.")) {
      throw new Error(`Table name must start with session_: ${tableName}`)
    }
  }
  
  return escapeIdentifier(tableName)
}

/**
 * Validates and escapes a session ID for use in SQL queries
 */
export function safeSessionId(sessionId: string | null | undefined): string | null {
  if (!sessionId) return null
  
  if (!validateSessionId(sessionId)) {
    throw new Error(`Invalid session ID: ${sessionId}`)
  }
  
  return escapeLiteral(sessionId)
}

/**
 * Validates an embedding vector and constructs a safe PostgreSQL vector literal
 * Ensures the vector is an array of numbers with the expected dimension
 */
export function safeVectorLiteral(
  embedding: number[], 
  expectedDim: number = 768
): string {
  if (!Array.isArray(embedding)) {
    throw new Error("Embedding must be an array")
  }
  
  if (embedding.length !== expectedDim) {
    throw new Error(
      `Invalid embedding dimension: expected ${expectedDim}, got ${embedding.length}`
    )
  }
  
  // Validate all elements are numbers
  for (let i = 0; i < embedding.length; i++) {
    if (typeof embedding[i] !== "number" || !isFinite(embedding[i])) {
      throw new Error(`Invalid embedding value at index ${i}: ${embedding[i]}`)
    }
  }
  
  // Construct vector literal: '[1,2,3]'::vector
  // This is safe because we've validated all values are finite numbers
  return `'[${embedding.join(",")}]'::vector`
}


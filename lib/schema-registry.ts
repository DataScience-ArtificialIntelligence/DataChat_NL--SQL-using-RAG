import { createClient } from "@supabase/supabase-js"
import type { TableSchema } from "@/lib/types"
import { embedText } from "@/lib/embeddings"
import { safeVectorLiteral } from "@/lib/sql-escape"
import { escapeLiteral } from "@/lib/sql-escape"

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

/**
 * Generate schema text for embedding
 */
function schemaToText(tableName: string, columnName: string, dataType: string, description?: string): string {
  return `Table ${tableName}, column ${columnName} (${dataType}): ${description || `Column ${columnName} of type ${dataType}`}`
}

/**
 * Populate schema registry with embeddings
 */
export async function populateSchemaRegistry(schema: TableSchema): Promise<void> {
  const supa = admin()

  for (const [tableName, tableInfo] of Object.entries(schema)) {
    for (const column of tableInfo.columns) {
      if (!column.name || !column.dataType) {
        console.warn(`[schema-registry] Skipping invalid column: ${tableName}.${column.name} (${column.dataType})`)
        continue
      }
      // Check if already exists
      const { data: existing } = await supa
        .from("schema_registry")
        .select("id")
        .eq("table_name", tableName)
        .eq("column_name", column.name)
        .single()

      if (existing) continue

      // Generate embedding
      const schemaText = schemaToText(tableName, column.name, column.dataType, column.description)
      const embedding = await embedText(schemaText)

      if (!embedding.length) {
        console.warn(`[schema-registry] Failed to embed: ${schemaText}`)
        continue
      }

      // Insert using raw SQL to properly handle vector
      const embeddingStr = `[${embedding.join(",")}]`
      const sql = `
        INSERT INTO schema_registry (table_name, column_name, data_type, description, schema_text, embedding)
        VALUES (${escapeLiteral(tableName)}, ${escapeLiteral(column.name)}, ${escapeLiteral(column.dataType)}, ${column.description ? escapeLiteral(column.description) : 'NULL'}, ${escapeLiteral(schemaText)}, '${embeddingStr}'::vector)
      `
      const { error } = await supa.rpc("execute_ddl", {
        ddl_statement: sql
      })

      if (error) {
        console.error(`[schema-registry] Failed to insert ${tableName}.${column.name}:`, error)
      }
    }
  }
}

/**
 * Retrieve relevant schema for a user query
 */
export async function retrieveRelevantSchema(userQuery: string, topK: number = 5): Promise<string[]> {
  const supa = admin()

  const queryEmbedding = await embedText(userQuery)
  if (!queryEmbedding.length) {
    console.warn("[schema-registry] Failed to embed query")
    return []
  }

  const vectorLiteral = safeVectorLiteral(queryEmbedding, EMBEDDING_DIM)

  const { data, error } = await supa.rpc("execute_raw_sql", {
    sql_query: `
      SELECT table_name, column_name, data_type, description
      FROM schema_registry
      ORDER BY embedding <=> ${vectorLiteral}
      LIMIT ${topK}
    `
  })

  if (error) {
    console.error("[schema-registry] Retrieval error:", error)
    return []
  }

  // Return unique table.column strings
  const uniqueSchemas = new Set<string>()
  if (Array.isArray(data)) {
    for (const row of data) {
      uniqueSchemas.add(`${row.table_name}.${row.column_name}`)
    }
  }

  return Array.from(uniqueSchemas)
}

/**
 * Get schema context string for prompt
 */
export async function getSchemaContextForQuery(userQuery: string, fullSchema: TableSchema): Promise<string> {
  const relevantColumns = await retrieveRelevantSchema(userQuery, 10)

  if (!relevantColumns.length) {
    // Fallback to full schema if retrieval fails
    return Object.entries(fullSchema)
      .map(([t, info]) => `Table: ${t}\nColumns: ${info.columns.map(c => `${c.name} (${c.dataType})`).join(", ")}`)
      .join("\n\n")
  }

  // Group by table
  const tableMap: { [table: string]: string[] } = {}
  for (const col of relevantColumns) {
    const [table, column] = col.split('.')
    if (!tableMap[table]) tableMap[table] = []
    tableMap[table].push(column)
  }

  return Object.entries(tableMap)
    .map(([table, columns]) => {
      const tableInfo = fullSchema[table]
      if (!tableInfo) return `Table: ${table}\nColumns: ${columns.join(", ")}`

      const relevantColumnInfos = tableInfo.columns.filter(c => columns.includes(c.name))
      return `Table: ${table}\nColumns: ${relevantColumnInfos.map(c => `${c.name} (${c.dataType})`).join(", ")}`
    })
    .join("\n\n")
}
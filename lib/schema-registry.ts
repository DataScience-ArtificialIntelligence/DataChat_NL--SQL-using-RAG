import { createClient } from "@supabase/supabase-js"
import type { TableSchema } from "@/lib/types"
import { embedText } from "@/lib/embeddings"
import { safeVectorLiteral, escapeLiteral } from "@/lib/sql-escape"
import {
  getAllLogicalTables,
} from "@/lib/reasoning/logicalSchemaRegistry"

const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || "768")

/* -----------------------------
   Supabase admin
------------------------------*/
function admin() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error("Supabase URL or service role key is not configured")
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/* -----------------------------
   Embedding helpers
------------------------------*/
function schemaToText(
  logicalTable: string,
  columnName: string,
  description?: string
): string {
  return `Logical table ${logicalTable}, column ${columnName}: ${
    description || `Column ${columnName}`
  }`
}

/* -----------------------------
   Populate schema registry
   (LOGICAL SOURCE OF TRUTH)
------------------------------*/
export async function populateSchemaRegistry(
  _physicalSchema: TableSchema
): Promise<void> {
  const supa = admin()

  const logicalTables = getAllLogicalTables()

  for (const table of logicalTables) {
    for (const column of table.columns) {
      const { data: existing } = await supa
        .from("schema_registry")
        .select("id")
        .eq("table_name", table.logicalName)
        .eq("column_name", column)
        .single()

      if (existing) continue

      const schemaText = schemaToText(
        table.logicalName,
        column,
        table.description
      )

      const embedding = await embedText(schemaText)
      if (!embedding.length) continue

      const embeddingStr = `[${embedding.join(",")}]`

      const sql = `
        INSERT INTO schema_registry
          (table_name, column_name, schema_text, embedding)
        VALUES
          (${escapeLiteral(table.logicalName)},
           ${escapeLiteral(column)},
           ${escapeLiteral(schemaText)},
           '${embeddingStr}'::vector)
      `

      await supa.rpc("execute_ddl", { ddl_statement: sql })
    }
  }
}

/* -----------------------------
   Retrieve relevant logical schema
------------------------------*/
export async function retrieveRelevantSchema(
  userQuery: string,
  topK = 8
): Promise<string[]> {
  const supa = admin()

  const embedding = await embedText(userQuery)
  if (!embedding.length) return []

  const vectorLiteral = safeVectorLiteral(embedding, EMBEDDING_DIM)

  const { data } = await supa.rpc("execute_raw_sql", {
    sql_query: `
      SELECT table_name, column_name
      FROM schema_registry
      ORDER BY embedding <=> ${vectorLiteral}
      LIMIT ${topK}
    `,
  })

  if (!Array.isArray(data)) return []

  const result = new Set<string>()
  for (const row of data) {
    result.add(`${row.table_name}.${row.column_name}`)
  }

  return Array.from(result)
}

/* -----------------------------
   LLM-SAFE SCHEMA CONTEXT
   (RAG + CLOSED WORLD)
------------------------------*/
export async function getSchemaContextForQuery(
  userQuery: string
): Promise<string> {
  const logicalTables = getAllLogicalTables()
  if (!logicalTables.length) {
    return "No datasets available."
  }

  const relevant = await retrieveRelevantSchema(userQuery)

  // Fallback: full logical schema
  if (!relevant.length) {
    return logicalTables
      .map(
        t => `
TABLE: ${t.logicalName}
DESCRIPTION: ${t.description || "Dataset"}
COLUMNS:
${t.columns.map(c => `- ${c}`).join("\n")}
`.trim()
      )
      .join("\n\n")
  }

  // RAG-filtered schema
  const byTable: Record<string, string[]> = {}

  for (const entry of relevant) {
    const [table, column] = entry.split(".")
    if (!byTable[table]) byTable[table] = []
    byTable[table].push(column)
  }

  return Object.entries(byTable)
    .map(([table, columns]) => {
      const meta = logicalTables.find(t => t.logicalName === table)

      return `
TABLE: ${table}
DESCRIPTION: ${meta?.description || "Dataset"}
COLUMNS:
${columns.map(c => `- ${c}`).join("\n")}
`.trim()
    })
    .join("\n\n")
}

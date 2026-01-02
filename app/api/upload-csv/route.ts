export const runtime = "nodejs";
import type { NextRequest } from "next/server"
import Papa from "papaparse"
import { createClient } from "@supabase/supabase-js"
import { getOrCreateSession, getTableName } from "@/lib/session"

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_ROWS = 50000 // Prevent memory explosion

// --- IMPORTANT: We MUST use service role client for DDL ---
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env.local"
    )
  }

  // Validate URL format early to provide clearer error messages instead of a generic fetch failure
  try {
    // eslint-disable-next-line no-new
    new URL(url)
  } catch (e) {
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL: ${String(e instanceof Error ? e.message : e)}`)
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

export async function POST(req: NextRequest) {
  try {
    const session = await getOrCreateSession()
    const formData = await req.formData()
    const file = formData.get("file") as File

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return Response.json({ error: "Only CSV files are allowed" }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      )
    }

    const content = await file.text()
    if (!content.trim()) {
      return Response.json({ error: "CSV file is empty" }, { status: 400 })
    }

    const supabase = getServiceClient()

    return new Promise((resolve) => {
      Papa.parse(content, {
        header: true,
        skipEmptyLines: "greedy",
        transformHeader: (h) =>
          h
            .trim()
            .replace(/[^a-zA-Z0-9_]/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "")
            .toLowerCase()
            .slice(0, 63),
        complete: async (results) => {
          try {
            if (results.errors.length > 0) {
              resolve(
                Response.json(
                  { error: "CSV parsing error: " + results.errors[0].message },
                  { status: 400 }
                )
              )
              return
            }

            const rows = results.data as any[]

            if (rows.length === 0) {
              resolve(Response.json({ error: "CSV has no rows" }, { status: 400 }))
              return
            }

            if (rows.length > MAX_ROWS) {
              resolve(
                Response.json(
                  { error: `Too many rows (max ${MAX_ROWS})` },
                  { status: 400 }
                )
              )
              return
            }

            const headers = Object.keys(rows[0] || {})
            if (headers.length === 0) {
              resolve(
                Response.json({ error: "No valid columns found" }, { status: 400 })
              )
              return
            }

            const tableName = getTableName(file.name, session.id)

            // --------------------------------------
            // 1. DROP TABLE SAFELY
            // --------------------------------------
            const drop = await supabase.rpc("execute_ddl", {
              ddl_statement: `DROP TABLE IF EXISTS "${tableName}" CASCADE`,
            })

            if (drop.error) {
              console.error("[v0] DROP TABLE error:", drop.error)
            }

            // --------------------------------------
            // 2. CREATE TABLE SAFELY
            // --------------------------------------
            const colDefs = headers.map((h) => `"${h}" TEXT`).join(", ")

            const createSql = `
              CREATE TABLE IF NOT EXISTS "${tableName}" (
                id BIGSERIAL PRIMARY KEY,
                ${colDefs},
                session_id TEXT DEFAULT '${session.id}',
                created_at TIMESTAMPTZ DEFAULT NOW()
              )
            `

            const createRes = await supabase.rpc("execute_ddl", {
              ddl_statement: createSql,
            })

            if (createRes.error) {
              console.error("[v0] Table creation error:", createRes.error)
              resolve(
                Response.json(
                  { error: "Failed to create table: " + createRes.error.message },
                  { status: 500 }
                )
              )
              return
            }

            // --------------------------------------
            // 3. BATCH INSERT
            // --------------------------------------
            const values = rows
              .map((row) => {
                const vals = headers.map((h) =>
                  row[h]
                    ? `'${String(row[h]).replace(/'/g, "''")}'`
                    : "NULL"
                )
                vals.push(`'${session.id}'`) // session_id
                return `(${vals.join(", ")})`
              })
              .join(", ")

            const insertSql = `
              INSERT INTO "${tableName}" (${headers.map((h) => `"${h}"`).join(", ")}, session_id)
              VALUES ${values}
            `

            const insertRes = await supabase.rpc("execute_ddl", {
              ddl_statement: insertSql,
            })

            if (insertRes.error) {
              console.error("[v0] INSERT error:", insertRes.error)

              await supabase.rpc("execute_ddl", {
                ddl_statement: `DROP TABLE IF EXISTS "${tableName}" CASCADE`
              })

              resolve(
                Response.json(
                  { error: "Insert failed: " + insertRes.error.message },
                  { status: 500 }
                )
              )
              return
            }

            resolve(
              Response.json({
                tableName,
                columns: headers,
                rowCount: rows.length,
                sessionId: session.id,
              })
            )
          } catch (err) {
            console.error("[v0] CSV processing error:", err)
            resolve(
              Response.json(
                { error: err instanceof Error ? err.message : "Upload failed" },
                { status: 500 }
              )
            )
          }
        },
        error: (err) => {
          resolve(Response.json({ error: err.message }, { status: 400 }))
        },
      })
    })
  } catch (err) {
    console.error("[v0] Upload CSV fatal error:", err)
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    )
  }
}

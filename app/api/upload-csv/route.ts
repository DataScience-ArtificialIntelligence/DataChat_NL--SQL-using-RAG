export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";
import { getOrCreateSession } from "@/lib/session";
import { validateSessionId } from "@/lib/sql-escape";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ROWS = 50000;

/* -----------------------------
   Supabase admin client
------------------------------*/
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  new URL(url); // validate early

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/* -----------------------------
   SAFE IDENTIFIER HELPERS
------------------------------*/
function safeIdentifier(raw: string) {
  const cleaned = raw
    .toLowerCase()
    .replace(/\.csv$/i, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);

  if (!cleaned) {
    throw new Error("Invalid or empty identifier after sanitization");
  }

  return cleaned;
}

function buildTableName(fileName: string, sessionId: string) {
  const base = safeIdentifier(fileName || "data");
  const sessionPart = safeIdentifier(sessionId || "session");
  return `session_${sessionPart}_${base}`;
}

/* -----------------------------
   Route
------------------------------*/
export async function POST(req: NextRequest) {
  try {
    const session = await getOrCreateSession();
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      return Response.json({ error: "Only CSV files allowed" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    const content = await file.text();
    if (!content.trim()) {
      return Response.json({ error: "CSV file is empty" }, { status: 400 });
    }

    const supabase = getServiceClient();

    return new Promise((resolve) => {
      Papa.parse(content, {
        header: true,
        skipEmptyLines: "greedy",

        /* 🔥 FIX IS HERE */
        transformHeader: (h: string, i: number) => {
          try {
            return safeIdentifier(h).slice(0, 63);
          } catch {
            // Auto-fallback for empty / invalid CSV headers
            return `column_${i + 1}`;
          }
        },

        complete: async (results: Papa.ParseResult<Record<string, unknown>>) => {
          try {
            if (results.errors.length > 0) {
              resolve(
                Response.json(
                  { error: results.errors[0].message },
                  { status: 400 }
                )
              );
              return;
            }

            const rows = results.data as any[];

            if (rows.length === 0) {
              resolve(Response.json({ error: "CSV has no rows" }, { status: 400 }));
              return;
            }

            if (rows.length > MAX_ROWS) {
              resolve(
                Response.json(
                  { error: `Too many rows (max ${MAX_ROWS})` },
                  { status: 400 }
                )
              );
              return;
            }

            const headers = Object.keys(rows[0] || {});
            if (headers.length === 0) {
              resolve(
                Response.json(
                  { error: "No valid columns found" },
                  { status: 400 }
                )
              );
              return;
            }

            /* -----------------------------
               SAFE TABLE NAME
            ------------------------------*/
            const tableName = buildTableName(file.name, session.id);
            console.log("[upload] Creating table:", tableName);

            /* -----------------------------
               DROP TABLE
            ------------------------------*/
            await supabase.rpc("execute_ddl", {
              ddl_statement: `DROP TABLE IF EXISTS "${tableName}" CASCADE`,
            });

            /* -----------------------------
               CREATE TABLE
            ------------------------------*/
            const colDefs = headers.map((h) => `"${h}" TEXT`).join(", ");

            // Validate and escape session.id for SQL (defense-in-depth, though nanoid is already safe)
            if (!validateSessionId(session.id)) {
              throw new Error("Invalid session ID format");
            }
            const escapedSessionId = session.id.replace(/'/g, "''");
            
            const createSql = `
              CREATE TABLE IF NOT EXISTS "${tableName}" (
                id BIGSERIAL PRIMARY KEY,
                ${colDefs},
                session_id TEXT NOT NULL DEFAULT '${escapedSessionId}',
                created_at TIMESTAMPTZ DEFAULT NOW()
              );
            `;

            const createRes = await supabase.rpc("execute_ddl", {
              ddl_statement: createSql,
            });

            if (createRes.error) {
              resolve(
                Response.json(
                  { error: createRes.error.message },
                  { status: 500 }
                )
              );
              return;
            }

            /* -----------------------------
               INSERT DATA
            ------------------------------*/
            const values = rows
              .map((row) => {
                const vals = headers.map((h) =>
                  row[h] !== null && row[h] !== undefined
                    ? `'${String(row[h]).replace(/'/g, "''")}'`
                    : "NULL"
                );
                // session.id is already validated above, escape for SQL string literal
                vals.push(`'${session.id.replace(/'/g, "''")}'`);
                return `(${vals.join(", ")})`;
              })
              .join(", ");

            const insertSql = `
              INSERT INTO "${tableName}"
              (${headers.map((h) => `"${h}"`).join(", ")}, session_id)
              VALUES ${values};
            `;

            const insertRes = await supabase.rpc("execute_ddl", {
              ddl_statement: insertSql,
            });

            if (insertRes.error) {
              await supabase.rpc("execute_ddl", {
                ddl_statement: `DROP TABLE IF EXISTS "${tableName}" CASCADE`,
              });

              resolve(
                Response.json(
                  { error: insertRes.error.message },
                  { status: 500 }
                )
              );
              return;
            }

            resolve(
              Response.json({
                tableName,
                columns: headers,
                rowCount: rows.length,
                sessionId: session.id,
              })
            );
          } catch (err) {
            resolve(
              Response.json(
                { error: err instanceof Error ? err.message : "Upload failed" },
                { status: 500 }
              )
            );
          }
        },

        error: (err: Error) => {
          resolve(Response.json({ error: err.message }, { status: 400 }));
        },
      });
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}

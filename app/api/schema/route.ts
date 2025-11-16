export const runtime = "nodejs";
import { getTableSchema } from "@/lib/db"
import type { NextRequest } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const tableName = searchParams.get("table")

    const schema = await getTableSchema(tableName || undefined)
    return Response.json(schema)
  } catch (error) {
    console.error("[v0] Schema API error:", error)
    return Response.json({ error: "Failed to fetch schema" }, { status: 500 })
  }
}

import { explainQuery } from "@/lib/query-executor"
import { validateSQL } from "@/lib/sql-validator"

export async function POST(req: Request) {
  try {
    const { sql } = await req.json()
    if (!sql || typeof sql !== "string") {
      return Response.json({ error: "SQL query is required" }, { status: 400 })
    }
    const validation = validateSQL(sql)
    if (!validation.isValid) {
      return Response.json({ error: validation.error }, { status: 400 })
    }
    const plan = await explainQuery(sql)
    return Response.json({ explainPlan: plan })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Explain failed" }, { status: 500 })
  }
}

import { executeQuery, explainQuery } from "@/lib/query-executor"
import { validateSQL } from "@/lib/sql-validator"

export async function POST(req: Request) {
  try {
    const { sql, debug } = await req.json()

    if (!sql || typeof sql !== "string") {
      return Response.json({ error: "SQL query is required" }, { status: 400 })
    }

    const validation = validateSQL(sql)
    if (!validation.isValid) {
      return Response.json(
        {
          error: validation.error,
          isValid: false,
        },
        { status: 400 },
      )
    }

    const [results, plan] = await Promise.all([
      executeQuery(sql),
      debug ? explainQuery(sql).catch((e) => ({ error: e?.message || "Explain failed" })) : Promise.resolve(null),
    ])

    return Response.json({
      results,
      rowCount: results.length,
      isValid: true,
      explainPlan: plan,
    })
  } catch (error) {
    console.error("[v0] Execute API error:", error)
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Query execution failed",
        isValid: false,
      },
      { status: 500 },
    )
  }
}

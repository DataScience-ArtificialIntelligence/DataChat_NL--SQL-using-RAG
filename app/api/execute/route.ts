import { executeQuery, explainQuery } from "@/lib/query-executor"

export async function POST(req: Request) {
  try {
    const { sql, debug } = await req.json()

    if (!sql || typeof sql !== "string") {
      return Response.json(
        { error: "SQL query is required", isValid: false },
        { status: 400 }
      )
    }

    /* ---------------------------------
       Execute SQL (NO LLM, NO VALIDATION)
    ----------------------------------*/
    const results = await executeQuery(sql)

    /* ---------------------------------
       Optional EXPLAIN (debug only)
    ----------------------------------*/
    let explainPlan = null

    if (debug === true) {
      try {
        explainPlan = await explainQuery(sql)
      } catch (err: any) {
        explainPlan = {
          error: err?.message || "Explain failed",
        }
      }
    }

    return Response.json({
      results,
      rowCount: results.length,
      isValid: true,
      explainPlan,
    })
  } catch (error) {
    console.error("[execute] API error:", error)

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Query execution failed",
        isValid: false,
      },
      { status: 500 }
    )
  }
}

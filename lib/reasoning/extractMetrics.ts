import type { StructuredPlan } from "./types"

type Aggregation =
  | "COUNT"
  | "AVG"
  | "SUM"
  | "MAX"
  | "MIN"

const METRIC_KEYWORDS: {
  words: string[]
  agg: Aggregation
}[] = [
  { words: ["how many", "count", "number of"], agg: "COUNT" },
  { words: ["average", "mean", "avg"], agg: "AVG" },
  { words: ["total", "sum"], agg: "SUM" },
  { words: ["maximum", "highest", "max"], agg: "MAX" },
  { words: ["minimum", "lowest", "min"], agg: "MIN" },
]

/**
 * Extract aggregation intent from natural language
 * Deterministic, schema-safe, SQL-valid
 */
export function extractMetrics(
  question: string,
  plan: StructuredPlan
): StructuredPlan {
  const q = question.toLowerCase()

  // 🔒 Reset metrics to avoid carryover
  plan.metrics = []

  for (const rule of METRIC_KEYWORDS) {
    if (!rule.words.some(w => q.includes(w))) continue

    const column = inferMetricColumn(rule.agg, plan)

    plan.metrics.push({
      aggregation: rule.agg,
      column,
    })

    // ✅ One metric per query (industry standard for v1)
    break
  }

  // 🔥 If aggregation is used, force aggregation mode
  if (plan.metrics.length > 0) {
    plan.columns = []
    plan.order_by = []
    plan.limit = null
  }

  return plan
}

/**
 * Infer the safest possible column for aggregation
 */
function inferMetricColumn(
  agg: Aggregation,
  plan: StructuredPlan
): string {
  // COUNT(*) is always valid
  if (agg === "COUNT") {
    return "*"
  }

  // Prefer explicitly selected column
  if (plan.columns.length === 1) {
    return plan.columns[0]
  }

  // Heuristic numeric column inference
  const NUMERIC_HINTS = [
    "balance",
    "amount",
    "price",
    "salary",
    "income",
    "age",
    "score",
    "count",
    "total",
    "duration",
    "years",
  ]

  for (const col of plan.columns) {
    if (NUMERIC_HINTS.some(h => col.toLowerCase().includes(h))) {
      return col
    }
  }

  // 🚨 Final safety fallback
  // We NEVER return "*" for AVG/SUM/etc
  throw new Error(
    `Cannot infer numeric column for ${agg}. Ask user to specify a column.`
  )
}

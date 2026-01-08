import type { StructuredPlan } from "@/lib/reasoning/types"

export function buildSQL(plan: StructuredPlan): string {
  /* ---------------------------------
     1. SELECT clause
     - metrics > columns > *
  ----------------------------------*/
  let selectParts: string[]

  if (plan.metrics && plan.metrics.length > 0) {
    // Aggregations take precedence
    selectParts = plan.metrics.map(
      m => `${m.aggregation}(${m.column})`
    )
  } else if (plan.columns && plan.columns.length > 0) {
    // Explicit column selection
    selectParts = plan.columns
  } else {
    // Semantic rule: empty columns = SELECT *
    selectParts = ["*"]
  }

  /* ---------------------------------
     2. FROM clause
  ----------------------------------*/
  let sql = `SELECT ${selectParts.join(", ")} FROM ${plan.tables.join(", ")}`

  /* ---------------------------------
     3. WHERE clause
  ----------------------------------*/
  if (plan.filters && plan.filters.length > 0) {
    const where = plan.filters.map(f => {
      const value =
        typeof f.value === "number"
          ? f.value
          : `'${String(f.value).replace(/'/g, "''")}'`

      return `${f.column} ${f.operator} ${value}`
    })

    sql += ` WHERE ${where.join(" AND ")}`
  }

  /* ---------------------------------
     4. GROUP BY clause
  ----------------------------------*/
  if (plan.group_by && plan.group_by.length > 0) {
    sql += ` GROUP BY ${plan.group_by.join(", ")}`
  }

  /* ---------------------------------
     5. ORDER BY clause
  ----------------------------------*/
  if (plan.order_by && plan.order_by.length > 0) {
    sql += ` ORDER BY ${plan.order_by.join(", ")}`
  }

  /* ---------------------------------
     6. LIMIT clause
  ----------------------------------*/
  if (typeof plan.limit === "number") {
    sql += ` LIMIT ${plan.limit}`
  }

  return sql
}

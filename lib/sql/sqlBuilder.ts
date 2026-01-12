import type { StructuredPlan } from "@/lib/reasoning/types"
import { resolvePhysicalTable } from "@/lib/db/tableResolver"

/**
 * Deterministic SQL builder
 * ❌ No LLM
 * ❌ No inference
 * ✅ Pure transformation
 */
export function buildSQL(
  plan: StructuredPlan,
  options?: {
    sessionId?: string
    explicitTableName?: string
  }
): string {
  /* ---------------------------------
     1. Resolve physical table
     (ALWAYS schema-qualified)
  ----------------------------------*/
  const logicalTable = plan.tables[0]
  const physicalTable = resolvePhysicalTable(logicalTable, options)

  const tableRef = `"${physicalTable}"`

  /* ---------------------------------
     2. SELECT clause (FIXED)
  ----------------------------------*/
  let selectParts: string[]

  if (plan.metrics && plan.metrics.length > 0) {
    selectParts = plan.metrics.map(m => {
      // ✅ COUNT(*) special-case
      if (
        m.aggregation === "COUNT" &&
        (!m.column || m.column === "*")
      ) {
        return `COUNT(*)`
      }

      // ✅ All other aggregations require column
      return `${m.aggregation}("${m.column}")`
    })
  } else if (plan.columns && plan.columns.length > 0) {
    selectParts = plan.columns.map(col => `"${col}"`)
  } else {
    selectParts = ["*"]
  }

  let sql = `SELECT ${selectParts.join(", ")} FROM ${tableRef}`

  /* ---------------------------------
     3. WHERE clause
  ----------------------------------*/
  if (plan.filters && plan.filters.length > 0) {
    const where = plan.filters.map(f => {
      const value =
        typeof f.value === "number"
          ? f.value
          : `'${String(f.value).replace(/'/g, "''")}'`

      return `"${f.column}" ${f.operator} ${value}`
    })

    sql += ` WHERE ${where.join(" AND ")}`
  }

  /* ---------------------------------
     4. GROUP BY
  ----------------------------------*/
  if (plan.group_by && plan.group_by.length > 0) {
    sql += ` GROUP BY ${plan.group_by
      .map(col => `"${col}"`)
      .join(", ")}`
  }

  /* ---------------------------------
     5. ORDER BY
  ----------------------------------*/
  if (plan.order_by && plan.order_by.length > 0) {
    sql += ` ORDER BY ${plan.order_by
      .map(col => `"${col}"`)
      .join(", ")}`
  }

  /* ---------------------------------
     6. LIMIT
  ----------------------------------*/
  if (typeof plan.limit === "number") {
    sql += ` LIMIT ${plan.limit}`
  }

  return sql
}

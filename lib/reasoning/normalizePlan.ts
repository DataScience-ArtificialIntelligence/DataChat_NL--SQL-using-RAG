import type { StructuredPlan } from "./types"
import { getLogicalTable } from "./logicalSchemaRegistry"

/**
 * Normalize plan so it is ALWAYS executable
 * - Never allows invalid columns
 * - Falls back to SELECT * when planner guesses
 */
export function normalizePlan(plan: StructuredPlan): StructuredPlan {
  if (!plan.tables || plan.tables.length === 0) {
    return plan
  }

  // Force single-table semantics (already enforced upstream)
  const logicalTable = plan.tables[0]
  const tableSchema = getLogicalTable(logicalTable)

  if (!tableSchema) {
    return plan
  }

  const validColumns = new Set(tableSchema.columns)

  /* ---------------------------------
     Normalize columns
     ----------------------------------*/
  let columns = Array.isArray(plan.columns) ? plan.columns : []

  // Case 1: "*" → SELECT *
  if (columns.includes("*")) {
    columns = []
  }

  // Case 2: hallucinated columns → SELECT *
  const hasInvalidColumn = columns.some(c => !validColumns.has(c))
  if (hasInvalidColumn) {
    columns = []
  }

  /* ---------------------------------
     Normalize filters / metrics safely
     ----------------------------------*/
  const filters = Array.isArray(plan.filters)
    ? plan.filters.filter(f => validColumns.has(f.column))
    : []

  const metrics = Array.isArray(plan.metrics)
    ? plan.metrics.filter(m => validColumns.has(m.column))
    : []

  const groupBy = Array.isArray(plan.group_by)
    ? plan.group_by.filter(c => validColumns.has(c))
    : []

  const orderBy = Array.isArray(plan.order_by)
    ? plan.order_by.filter(c => validColumns.has(c))
    : []

  return {
    ...plan,
    columns,
    filters,
    metrics,
    group_by: groupBy,
    order_by: orderBy,
  }
}

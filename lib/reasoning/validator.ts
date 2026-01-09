import type { StructuredPlan } from "./types"
import { getLogicalTable } from "./logicalSchemaRegistry"

export function validatePlan(plan: StructuredPlan) {
  /* ---------------------------------
     0. Basic sanity checks
  ----------------------------------*/
  if (!plan || !Array.isArray(plan.tables) || plan.tables.length === 0) {
    throw new Error("No table specified in plan")
  }

  plan.tables = Array.from(new Set(plan.tables))

  /* ---------------------------------
     1. Enforce single-table execution
  ----------------------------------*/
  if (plan.tables.length > 1) {
    throw new Error("Multiple tables not supported yet")
  }

  const logicalTable = plan.tables[0]
  const tableSchema = getLogicalTable(logicalTable)

  if (!tableSchema) {
    throw new Error(`Invalid logical table: ${logicalTable}`)
  }

  const validColumns = new Set<string>(tableSchema.columns)

  if (validColumns.size === 0) {
    throw new Error(`No columns registered for table: ${logicalTable}`)
  }

  /* ---------------------------------
     2. Normalize fields (WRITE BACK!)
  ----------------------------------*/
  plan.columns = Array.isArray(plan.columns) ? plan.columns : []
  plan.filters = Array.isArray(plan.filters) ? plan.filters : []
  plan.metrics = Array.isArray(plan.metrics) ? plan.metrics : []
  plan.group_by = Array.isArray(plan.group_by) ? plan.group_by : []
  plan.order_by = Array.isArray(plan.order_by) ? plan.order_by : []

  /* ---------------------------------
     3. Disallow SQL wildcard
  ----------------------------------*/
  if (plan.columns.includes("*")) {
    throw new Error(
      `Invalid column "*". Use empty columns array to mean SELECT *`
    )
  }

  /* ---------------------------------
     4. Validate selected columns
  ----------------------------------*/
  for (const col of plan.columns) {
    if (!validColumns.has(col)) {
      throw new Error(`Invalid column: ${col}`)
    }
  }

  /* ---------------------------------
     5. Validate filters
  ----------------------------------*/
  for (const filter of plan.filters) {
    if (!filter?.column || !filter?.operator) {
      throw new Error(`Invalid filter structure`)
    }

    if (!validColumns.has(filter.column)) {
      throw new Error(`Invalid filter column: ${filter.column}`)
    }
  }

  /* ---------------------------------
     6. Validate metrics
     - COUNT(*) allowed
     - Others require column
  ----------------------------------*/
  for (const metric of plan.metrics) {
    if (!metric?.aggregation) {
      throw new Error(`Invalid metric structure`)
    }

    if (
      metric.aggregation === "COUNT" &&
      (metric.column === "*" || !metric.column)
    ) {
      continue
    }

    if (!metric.column) {
      throw new Error(
        `Aggregation ${metric.aggregation} requires a column`
      )
    }

    if (!validColumns.has(metric.column)) {
      throw new Error(`Invalid metric column: ${metric.column}`)
    }
  }

  /* ---------------------------------
     7. GROUP BY validation
     - Required when mixing metrics + columns
  ----------------------------------*/
  if (plan.metrics.length > 0 && plan.columns.length > 0) {
    if (plan.group_by.length === 0) {
      throw new Error(
        `GROUP BY required when using metrics with columns`
      )
    }
  }

  for (const col of plan.group_by) {
    if (!validColumns.has(col)) {
      throw new Error(`Invalid group_by column: ${col}`)
    }
  }

  /* ---------------------------------
     8. ORDER BY validation
     - Must be grouped or aggregated
  ----------------------------------*/
  for (const col of plan.order_by) {
    const isGrouped = plan.group_by.includes(col)
    const isAggregated = plan.metrics.some(m => m.column === col)

    if (!isGrouped && !isAggregated) {
      throw new Error(
        `ORDER BY column "${col}" must be grouped or aggregated`
      )
    }
  }
}

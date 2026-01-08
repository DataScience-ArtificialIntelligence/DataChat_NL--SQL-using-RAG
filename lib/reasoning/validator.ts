import type { StructuredPlan } from "./types"

export function validatePlan(
  plan: StructuredPlan,
  schema: Record<string, any>
) {
  /* ---------------------------------
     0. Basic sanity checks
  ----------------------------------*/
  if (!plan.tables || plan.tables.length === 0) {
    throw new Error("No table specified in plan")
  }

  /* ---------------------------------
     1. Validate tables
  ----------------------------------*/
  for (const table of plan.tables) {
    if (!schema[table]) {
      throw new Error(`Invalid table: ${table}`)
    }
  }

  /* ---------------------------------
     2. Disallow SQL wildcard explicitly
  ----------------------------------*/
  if (plan.columns.includes("*")) {
    throw new Error(
      `Invalid column: "*". Use empty columns array to mean "all columns".`
    )
  }

  /* ---------------------------------
     3. Collect valid columns from schema
  ----------------------------------*/
  const validColumns = new Set<string>()

  for (const table of plan.tables) {
    const tableSchema = schema[table]

    if (tableSchema?.columns) {
      for (const col of Object.keys(tableSchema.columns)) {
        validColumns.add(col)
      }
    }
  }

  if (validColumns.size === 0) {
    throw new Error("No columns found for specified tables")
  }

  /* ---------------------------------
     4. Validate selected columns
     (empty array = SELECT *)
  ----------------------------------*/
  if (plan.columns.length > 0) {
    for (const col of plan.columns) {
      if (!validColumns.has(col)) {
        throw new Error(`Invalid column: ${col}`)
      }
    }
  }

  /* ---------------------------------
     5. Validate filters
  ----------------------------------*/
  for (const filter of plan.filters) {
    if (!validColumns.has(filter.column)) {
      throw new Error(`Invalid filter column: ${filter.column}`)
    }
  }

  /* ---------------------------------
     6. Validate metrics (aggregations)
  ----------------------------------*/
  if (plan.metrics && plan.metrics.length > 0) {
    for (const metric of plan.metrics) {
      if (!validColumns.has(metric.column)) {
        throw new Error(`Invalid metric column: ${metric.column}`)
      }
    }
  }
}

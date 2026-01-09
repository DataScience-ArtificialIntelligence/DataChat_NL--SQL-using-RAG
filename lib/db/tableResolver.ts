import { getLogicalTable } from "@/lib/reasoning/logicalSchemaRegistry"

/**
 * Resolve logical table → physical table
 * SINGLE source of truth
 */
export function resolvePhysicalTable(
  logicalTable: string,
  options?: {
    sessionId?: string
    explicitTableName?: string
  }
): string {
  /* ---------------------------------
     1. Explicit override (highest priority)
  ----------------------------------*/
  if (options?.explicitTableName) {
    return options.explicitTableName
  }

  /* ---------------------------------
     2. Logical registry lookup
  ----------------------------------*/
  const entry = getLogicalTable(logicalTable)

  if (!entry?.physicalName) {
    throw new Error(
      `Physical table not found for logical table: ${logicalTable}`
    )
  }

  return entry.physicalName
}

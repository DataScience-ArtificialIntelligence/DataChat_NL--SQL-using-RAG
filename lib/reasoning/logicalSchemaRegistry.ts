/**
 * Logical Schema Registry
 *
 * This is the ONLY source of truth for:
 * - logical tables visible to the LLM
 * - logical → physical table mapping
 * - column validation
 */

type LogicalTableEntry = {
  logicalName: string
  physicalName: string
  description?: string
  columns: Set<string>
}

/* ---------------------------------
   In-memory registry (per server)
----------------------------------*/
const registry = new Map<string, LogicalTableEntry>()

/* ---------------------------------
   Register logical table
----------------------------------*/
export function registerLogicalTable(args: {
  logicalName: string
  physicalName: string
  columns: string[]
  description?: string
}) {
  registry.set(args.logicalName, {
    logicalName: args.logicalName,
    physicalName: args.physicalName,
    description: args.description,
    columns: new Set(args.columns),
  })
}

/* ---------------------------------
   Get ONE logical table (validator)
----------------------------------*/
export function getLogicalTable(logicalName: string) {
  const entry = registry.get(logicalName)

  if (!entry) {
    throw new Error(`Unknown logical table: ${logicalName}`)
  }

  return {
    logicalName: entry.logicalName,
    physicalName: entry.physicalName,
    columns: Array.from(entry.columns),
    description: entry.description,
  }
}

/* ---------------------------------
   Get ALL logical tables (schema context)
----------------------------------*/
export function getAllLogicalTables() {
  return Array.from(registry.values()).map(t => ({
    logicalName: t.logicalName,
    physicalName: t.physicalName,
    columns: Array.from(t.columns),
    description: t.description,
  }))
}

/* ---------------------------------
   Logical → Physical resolver (SQL layer)
----------------------------------*/
export function resolvePhysicalTable(logicalName: string): string {
  const entry = registry.get(logicalName)

  if (!entry) {
    throw new Error(`Unknown logical table: ${logicalName}`)
  }

  return entry.physicalName
}

/* ---------------------------------
   Full logical schema (debug / tools)
----------------------------------*/
export function getLogicalSchema() {
  const out: Record<string, string[]> = {}

  for (const [name, entry] of registry.entries()) {
    out[name] = Array.from(entry.columns)
  }

  return out
}

export function normalizeSchema(
  rawSchema: any
): Record<string, { columns: Record<string, any> }> {
  const normalized: Record<string, { columns: Record<string, any> }> = {}

  // Case 1: already normalized
  for (const [key, value] of Object.entries(rawSchema)) {
    if (value && value.columns) {
      if (Array.isArray(value.columns)) {
        // columns as array → convert to map
        normalized[key] = {
          columns: Object.fromEntries(
            value.columns.map((c: any) => [c.name, c])
          ),
        }
      } else {
        normalized[key] = value
      }
    }
  }

  // Case 2: nested under tables
  if (rawSchema.tables) {
    for (const [table, info] of Object.entries(rawSchema.tables)) {
      if (info && (info as any).columns) {
        normalized[table] = {
          columns: Object.fromEntries(
            (info as any).columns.map((c: any) => [c.name, c])
          ),
        }
      }
    }
  }

  return normalized
}

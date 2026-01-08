export type Filter = {
  column: string
  operator: "=" | ">" | "<" | ">=" | "<=" | "LIKE"
  value: string | number
}

export type Metric = {
  column: string
  aggregation: "COUNT" | "SUM" | "AVG" | "MIN" | "MAX"
}

export type StructuredPlan = {
  intent: "select" | "aggregation" | "comparison"
  tables: string[]
  columns: string[]
  filters: Filter[]
  group_by: string[]
  order_by?: string[]
  limit?: number | null
  metrics?: Metric[]
}

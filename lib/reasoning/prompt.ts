export function buildReasoningPrompt(
  question: string,
  schemaContext: string
): string {
  return `
You are a database query planner.

STRICT RULES (VERY IMPORTANT):
- DO NOT generate SQL
- DO NOT explain anything
- DO NOT use "*" as a column name
- If the user wants all columns, use: "columns": []
- Use ONLY table and column names that appear in the schema
- Output ONLY valid JSON (no markdown, no comments)
- Invalid JSON = failure

SCHEMA:
${schemaContext}

USER QUESTION:
${question}

OUTPUT JSON FORMAT:
{
  "intent": "",
  "tables": [],
  "columns": [],
  "filters": [],
  "group_by": [],
  "order_by": [],
  "limit": null,
  "metrics": []
}
`
}

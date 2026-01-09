export function buildReasoningPrompt(
  question: string,
  schemaContext: string
): string {
  return `
You are a database query planner.

CRITICAL RULES (FAIL IF VIOLATED):
- You MUST choose table names ONLY from the SCHEMA section
- You MUST NOT invent table names
- NEVER use session-prefixed table names
- If the schema contains ONLY ONE table, you MUST use that table
- DO NOT generate SQL
- DO NOT explain anything
- DO NOT use "*" as a column name
- If all columns are requested, use: "columns": []
- Output ONLY valid JSON (no markdown, no comments)

SCHEMA (THIS IS THE COMPLETE WORLD — NOTHING ELSE EXISTS):
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

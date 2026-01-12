import { generateText } from "ai"
import { createGroq } from "@ai-sdk/groq"

import { buildReasoningPrompt } from "./prompt"
import type { StructuredPlan } from "./types"
import { extractMetrics } from "./extractMetrics"

/**
 * LLM → STRUCTURED PLAN ONLY
 * ❌ No SQL
 * ❌ No table resolution
 * ❌ No execution logic
 */
export async function structuredReasoning(
  question: string,
  schemaContext: string
): Promise<StructuredPlan> {
  const groq = createGroq({
    apiKey:
      process.env.GROQ_API_KEY ||
      process.env.NEXT_PUBLIC_GROQ_API_KEY!,
  })

  const prompt = buildReasoningPrompt(question, schemaContext)

  const result = await generateText({
    model: groq("llama-3.1-8b-instant"),
    prompt,
    temperature: 0, // deterministic
  })

  /* ---------------------------------
     1. Parse LLM output safely
  ----------------------------------*/
  let plan: StructuredPlan
  try {
    plan = JSON.parse(result.text) as StructuredPlan
  } catch {
    throw new Error("LLM returned invalid JSON for structured plan")
  }

  /* ---------------------------------
     2. Normalize missing fields
  ----------------------------------*/
  plan.tables = Array.isArray(plan.tables) ? plan.tables : []
  plan.columns = Array.isArray(plan.columns) ? plan.columns : []
  plan.filters = Array.isArray(plan.filters) ? plan.filters : []
  plan.group_by = Array.isArray(plan.group_by) ? plan.group_by : []
  plan.order_by = Array.isArray(plan.order_by) ? plan.order_by : []
  plan.metrics = Array.isArray(plan.metrics) ? plan.metrics : []
  plan.limit =
    typeof plan.limit === "number" ? plan.limit : null

  /* ---------------------------------
     3. Deterministic metric extraction
     (COUNT, AVG, SUM, MIN, MAX)
  ----------------------------------*/
  plan = extractMetrics(question, plan)

  /* ---------------------------------
     4. Safety guardrail
     Prevent accidental full-table scans
  ----------------------------------*/
  if (
    (!plan.metrics || plan.metrics.length === 0) &&
    !plan.limit
  ) {
    plan.limit = 100
  }

  return plan
}

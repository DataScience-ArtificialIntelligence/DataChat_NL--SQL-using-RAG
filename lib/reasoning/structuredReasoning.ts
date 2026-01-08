import { generateText } from "ai"
import { createGroq } from "@ai-sdk/groq"
import { buildReasoningPrompt } from "./prompt"
import type { StructuredPlan } from "./types"

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
    temperature: 0,
  })

  return JSON.parse(result.text) as StructuredPlan
}

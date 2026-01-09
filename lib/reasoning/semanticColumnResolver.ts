import { cosineSimilarity } from "@/lib/utils/cosine";
import { getLogicalTable } from "./logicalSchemaRegistry";

/**
 * Resolve intent text to the most semantically similar column
 * using precomputed column embeddings.
 */
export function resolveColumnSemantically(
  intent: string,
  logicalTableName: string,
  threshold = 0.65
): string | null {
  const table = getLogicalTable(logicalTableName);
  if (!table?.columnEmbeddings) return null;

  let bestMatch: { col: string; score: number } | null = null;

  for (const [column, embedding] of Object.entries(
    table.columnEmbeddings
  )) {
    const score = cosineSimilarity(
      table.intentEmbedding ?? [],
      embedding
    );

    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { col: column, score };
    }
  }

  return bestMatch?.col ?? null;
}
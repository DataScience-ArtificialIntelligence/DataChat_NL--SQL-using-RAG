import type { StructuredPlan } from "@/lib/reasoning/types";

/**
 * Generates a deterministic semantic cache key
 * independent of user phrasing.
 */
export function buildSemanticCacheKey(
  tableName: string,
  plan: StructuredPlan
): string {
  const keyObj = {
    table: tableName,
    intent: plan.intent ?? "",
    columns: [...(plan.columns ?? [])].sort(),
    metrics: [...(plan.metrics ?? [])].sort(
      (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))
    ),
    filters: [...(plan.filters ?? [])].sort(
      (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))
    ),
    group_by: [...(plan.group_by ?? [])].sort(),
  };

  return JSON.stringify(keyObj);
}
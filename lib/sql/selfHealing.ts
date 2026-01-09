// lib/sql/selfHealing.ts

import type { StructuredPlan } from "@/lib/reasoning/types";

/**
 * Identify recoverable SQL / execution failures
 */
export function analyzeSqlFailure(err: unknown): string {
  const msg =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();

  if (msg.includes("does not exist")) return "COLUMN_NOT_FOUND";
  if (msg.includes("session")) return "SESSION_MISMATCH";
  if (msg.includes("syntax")) return "PLAN_INCONSISTENT";

  return "UNHEALABLE";
}

/**
 * Repair STRUCTURED PLAN (never raw SQL)
 */
export function repairPlan(
  plan: StructuredPlan,
  failureType: string,
  ctx: {
    logicalTableName: string;
    availableColumns: string[];
  }
): StructuredPlan | null {
  switch (failureType) {
    case "COLUMN_NOT_FOUND":
      return {
        ...plan,
        columns: plan.columns.filter(c =>
          ctx.availableColumns.includes(c)
        ),
      };

    case "SESSION_MISMATCH":
      return {
        ...plan,
        tables: [ctx.logicalTableName],
      };

    case "PLAN_INCONSISTENT":
      return {
        ...plan,
        filters: [],
        order_by: [],
      };

    default:
      return null;
  }
}
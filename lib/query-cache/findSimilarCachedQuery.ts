import { createClient } from "@supabase/supabase-js";
import { buildSemanticCacheKey } from "./semanticKey";
import type { StructuredPlan } from "@/lib/reasoning/types";

function admin() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase URL or service role key is not configured");
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function findSemanticCachedQuery({
  sessionId,
  tableName,
  plan,
  embedding,
}: {
  sessionId: string;
  tableName: string;
  plan: StructuredPlan;
  embedding: number[];
}) {
  const supabase = admin();

  const semanticKey = buildSemanticCacheKey(tableName, plan);

  // 1️⃣ Exact semantic match (FAST & SAFE)
  const { data: exactHit } = await supabase
    .from("conversation_query_cache")
    .select("*")
    .eq("session_id", sessionId)
    .eq("table_name", tableName)
    .eq("semantic_key", semanticKey)
    .limit(1);

  if (exactHit?.length) {
    return { hit: exactHit[0], reason: "semantic_exact" };
  }

  // 2️⃣ Semantic-similar fallback (embedding)
  const { data: similarHit } = await supabase.rpc(
    "match_queries_by_embedding",
    {
      query_embedding: embedding,
      match_threshold: 0.75,
      match_count: 1,
    }
  );

  if (similarHit?.length) {
    return { hit: similarHit[0], reason: "semantic_similar" };
  }

  return null;
}

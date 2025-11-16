import { createClient } from "@supabase/supabase-js"

type Role = "user" | "assistant"

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function addMemory(params: {
  sessionId: string
  role: Role
  content: string
  sql?: string | null
}) {
  const supa = admin()
  const { error } = await supa.from("conversation_memory").insert({
    session_id: params.sessionId,
    role: params.role,
    content: params.content,
    sql: params.sql ?? null,
  } as any)
  if (error) throw error
}

export async function getRecentMemory(sessionId: string, limit = 8) {
  const supa = admin()
  const { data, error } = await supa
    .from("conversation_memory")
    .select("role, content, sql, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) return []
  return (data || []).reverse()
}

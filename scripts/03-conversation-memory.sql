-- Conversation memory table for per-session chat history
create table if not exists public.conversation_memory (
  id bigserial primary key,
  session_id text not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  sql text,
  created_at timestamptz not null default now()
);

-- Helpful index for fast reads
create index if not exists conversation_memory_session_created_idx
  on public.conversation_memory (session_id, created_at desc);

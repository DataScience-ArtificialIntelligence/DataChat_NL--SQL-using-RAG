-- ==========================================
-- Schema Registry for RAG-based Schema Retrieval
-- Stores table/column metadata with embeddings for semantic search
-- ==========================================

create table if not exists public.schema_registry (
  id bigserial primary key,

  -- Table name
  table_name text not null,

  -- Column name
  column_name text not null,

  -- Data type
  data_type text not null,

  -- Description
  description text,

  -- Text representation for embedding
  schema_text text not null,

  -- Embedding vector (768 dims for nomic-embed-text)
  embedding vector(768),

  -- Timestamp
  created_at timestamptz not null default now(),

  unique(table_name, column_name)
);

-- ==========================================
-- Indexes for fast semantic search
-- ==========================================

-- HNSW vector index for cosine similarity search
create index if not exists schema_registry_embedding_idx
on public.schema_registry
using hnsw (embedding vector_cosine_ops);

-- Filter by table name
create index if not exists schema_registry_table_idx
on public.schema_registry (table_name);

-- Sort by newest entries
create index if not exists schema_registry_created_idx
on public.schema_registry (created_at desc);
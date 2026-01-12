-- Add semantic_key column to conversation_query_cache table
ALTER TABLE conversation_query_cache
ADD COLUMN IF NOT EXISTS semantic_key TEXT;
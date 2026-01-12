#!/usr/bin/env node

// Script to add semantic_key column to conversation_query_cache table

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables");
  console.log("Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set");
  console.log("Then run the following SQL in your Supabase SQL editor:");
  console.log("ALTER TABLE conversation_query_cache ADD COLUMN IF NOT EXISTS semantic_key TEXT;");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function addColumn() {
  try {
    console.log("Checking database connection...");

    const { error } = await supabase.from("conversation_query_cache").select("*").limit(1);

    if (error) {
      console.error("Error connecting to table:", error);
      console.log("Please run the following SQL in your Supabase SQL editor:");
      console.log("ALTER TABLE conversation_query_cache ADD COLUMN IF NOT EXISTS semantic_key TEXT;");
      process.exit(1);
    }

    console.log("✅ Connected to database successfully!");
    console.log("Please run the following SQL in your Supabase SQL editor to add the semantic_key column:");
    console.log("ALTER TABLE conversation_query_cache ADD COLUMN IF NOT EXISTS semantic_key TEXT;");

  } catch (err) {
    console.error("Failed:", err);
    console.log("Please run the following SQL in your Supabase SQL editor:");
    console.log("ALTER TABLE conversation_query_cache ADD COLUMN IF NOT EXISTS semantic_key TEXT;");
  }
}

addColumn();
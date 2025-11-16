📘 DataChat – Natural Language to SQL with RAG (Supabase + Groq + Ollama + Next.js)

DataChat is an AI-powered data analytics system that allows users to:

1.Upload one CSV dataset

2.Automatically load it into Supabase Postgres

3.Ask questions in natural language

4.Convert the questions to SQL using Groq LLM

5.Automatically execute SQL on Supabase

6.Display results in tables and charts

7.Speed up repeated/related questions using a pgvector-based RAG semantic cache

This project integrates Next.js App Router, Supabase, Groq LLM, Ollama embeddings, and pgvector to create a complete NL → SQL → Analytics pipeline.

👥 Team Members
Name	Roll No.	Contribution
PIYUSH PRASHANT	24BDS055	RAG pipeline, Embeddings
MS HARSHITHA	24BDS038	Testing, Documentation, Integration
PRIYANSHU MITTAL	24BDS058	Backend, Supabase Integration, Visualization
JAKKUVA SAMEER	24BDS026	Frontend UI, Debugging
📁 Repository Structure
DATACHAT_NL--SQL-MAIN/
|
├── app/                               # Next.js App Router
│   ├── api/
│   │   ├── chat/                      # Main NL → SQL chat route
│   │   ├── upload-csv/                # Converts CSV → Supabase table
│   │   └── ...
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
|
├── components/                        # UI Components
│   ├── chat-interface.tsx
│   ├── chat-message.tsx
│   ├── results-table.tsx
│   ├── data-chart.tsx
│   ├── csv-upload.tsx
│   └── ui/
|
├── lib/                               # Backend utilities & RAG implementation
│   ├── setup.ts                       # Auto-create pgvector, memory, cache tables
│   ├── embeddings.ts                  # Generates embeddings (Ollama)
│   ├── query-cache.ts                 # Semantic cache (pgvector)
│   ├── query-executor.ts              # Runs SQL on Supabase
│   ├── db.ts                          # Loads schema dynamically
│   ├── memory.ts                      # Conversation memory storage
│   ├── session.ts                     # Session generator
│   ├── prompts.ts                     # System prompts
│   ├── sql-validator.ts               # SQL safety validator
│   └── types.ts
|
├── scripts/                           # SQL DDL scripts (Optional manual runs)
│   ├── 01-setup-database-functions.sql
│   ├── 02-reload-schema-cache.sql
│   ├── 03-conversation-memory.sql
│   └── conversation-query-cache.sql
|
├── public/
├── styles/
|
├── .env.local                         # Environment variables
├── env.example
├── DEPLOYMENT.md
├── COMPLETE-PROJECT-SUMMARY.md
├── package.json
└── README.md

⚙️ Installation & Setup Guide
1️⃣ Prerequisites

Make sure you have:

Node.js 18+

npm or pnpm

Supabase project (URL + keys)

Groq API key

Ollama installed locally

nomic-embed-text embedding model

2️⃣ Clone the Repository
git clone <repo-url>
cd DATACHAT_NL--SQL-MAIN

3️⃣ Install Dependencies
npm install


or

pnpm install

4️⃣ Setup Environment Variables

Create .env.local in the root:

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Groq API
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxx

# Embeddings
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIM=768

5️⃣ Install & Run Ollama
Install Ollama:

Windows:

winget install Ollama.Ollama


Mac:

brew install ollama


Linux:

curl -fsSL https://ollama.com/install.sh | sh

Pull the embedding model:
ollama pull nomic-embed-text

Start Ollama:
ollama serve

6️⃣ Start Dev Server
npm run dev


Open:
👉 http://localhost:3000

🔍 How the System Works
▶️ Step 1 — Upload CSV

You upload one CSV file

The system parses and converts it into a Supabase table:

session_<sessionId>_<fileName>

▶️ Step 2 — Ask a Natural Language Question

Example:
"Show me the total records"

▶️ Step 3 — Embedding + RAG Search

Your question is embedded using nomic-embed-text (768-dim)

RAG searches conversation_query_cache using pgvector

If similarity > threshold → cache hit

Else → generate SQL with Groq

▶️ Step 4 — SQL Generation (Groq LLM)

Groq’s fast models generate:

SQL query

Explanation summary

▶️ Step 5 — SQL Execution

SQL validated

Run on Supabase using RPC

Result returned in JSON

▶️ Step 6 — Output Rendering

Table view

Chart view (Recharts: bar, line, stacked bar)

Summary in natural language

▶️ Step 7 — Store in Query Cache

Saved into:

Column	Purpose
question	natural question
normalized_sql	stored SQL
result_sample	1–100 rows
row_count	total
question_embedding	768-vector
session_id, table_name	contextual info
▶️ Execution Summary
Action	Command
Install deps	npm install
Start Ollama	ollama serve
Run dev server	npm run dev
Open app	http://localhost:3000


🎥  Demo Video (Required for Submission)

Google drive link:

👉 https://drive.google.com/file/d/1sse8FFnlriYNVltsP1hpq3QQq2qXtd3b/view?usp=sharing

Suggested Script:

Start app

Upload CSV

Ask a question

Show SQL generated

Show result table

Open chart

Ask similar question

Demonstrate RAG cache hit

Summarize features
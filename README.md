DataChat – Natural Language → SQL Analytics with RAG

DataChat is an AI-powered analytics system that converts natural language questions into SQL queries, executes them on Supabase Postgres, and visualizes the results.
It also uses a pgvector-based semantic cache (RAG) to improve performance for repeated or similar questions.

Features

Upload CSV → automatically converted into a Supabase table

Ask questions in natural language

SQL is generated using Groq Llama-3 models

SQL validation and safe execution

Table and chart-based result visualization

Conversation memory

RAG semantic caching using pgvector

Fully built using: Next.js, Supabase, Groq API, Ollama embeddings

Team Members
Name	         Roll No.	         Contribution
Piyush Prashant	 24BDS055	 RAG pipeline, embeddings
MS Harshitha	 24BDS038	 Testing, documentation, integration
Priyanshu Mittal 24BDS058	 Backend, Supabase integration, visualization
Jakkuva Sameer	 24BDS026	 Frontend UI, debugging

Repository Structure
DATACHAT_NL--SQL-MAIN/
│
├── app/                         # Next.js App Router
│   ├── api/
│   │   ├── chat/                # NL → SQL chat route
│   │   ├── upload-csv/          # CSV → Supabase table
│   │   └── ...
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
│
├── components/                  # UI components
│   ├── chat-interface.tsx
│   ├── chat-message.tsx
│   ├── results-table.tsx
│   ├── data-chart.tsx
│   ├── csv-upload.tsx
│   └── ui/
│
├── lib/                         # Backend utilities & RAG logic
│   ├── setup.ts                 # Auto-create pgvector + tables
│   ├── embeddings.ts            # Ollama embeddings
│   ├── query-cache.ts           # pgvector search + cache
│   ├── query-executor.ts        # SQL executor
│   ├── db.ts                    # Dynamic schema loader
│   ├── memory.ts                # Conversation memory
│   ├── session.ts               # Session ID generator
│   ├── prompts.ts               # System prompt
│   ├── sql-validator.ts         # SQL safety validation
│   └── types.ts
│
├── scripts/                     # Optional SQL scripts
│   ├── 01-setup-database-functions.sql
│   ├── 02-reload-schema-cache.sql
│   ├── 03-conversation-memory.sql
│   └── conversation-query-cache.sql
│
├── public/
├── styles/
│
├── .env.local                   # Environment variables
├── env.example
├── DEPLOYMENT.md
├── COMPLETE-PROJECT-SUMMARY.md
├── package.json
└── README.md

Installation & Setup
1. Prerequisites

Node.js 18+

npm or pnpm

Supabase project

Groq API key

Ollama installed

Embedding model: nomic-embed-text (768-dim)

2. Clone the Repository
git clone <repository-url>
cd DATACHAT_NL--SQL-MAIN

3. Install Dependencies
npm install


Or:

pnpm install

4. Configure Environment Variables

Create .env.local:

NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

GROQ_API_KEY=gsk_your_key_here

EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_DIM=768

5. Install and Start Ollama

Install and run Ollama:

ollama serve


Pull the embedding model:

ollama pull nomic-embed-text

6. Start the Development Server
npm run dev


Now open:

http://localhost:3000

How the System Works
Step 1: User uploads a CSV

The system:

Parses CSV

Creates a Supabase table with name:
session_<sessionId>_<filename>

Step 2: User asks a question

Example:
“Show the total number of records.”

Step 3: Embedding is generated

Using Ollama’s nomic-embed-text model (768-dim).

Step 4: Semantic Cache Search (RAG)

The system checks conversation_query_cache for similar questions.

Step 5: If no match → LLM generates SQL

Groq Llama-3.1-8B-Instant is used.

Step 6: SQL is validated and executed

Supabase RPC runs the query.

Step 7: Results returned

Table view

Charts using Recharts

Step 8: Cache store

The question, SQL, and embedding are stored for future queries.

Running the App (Quick Commands)
Action	Command
Install dependencies	npm install
Start Ollama	ollama serve
Pull embedding model	ollama pull nomic-embed-text
Start dev server	npm run dev
Open app	http://localhost:3000
2-Minute Demo (Required)

Upload your demo video to Google Drive/YouTube.

Example placeholder:

https://drive.google.com/your-demo-video

Suggested Demo Checklist

Launch the app

Upload CSV

Show table in Supabase

Ask a natural-language question

Show SQL generated

Show results table

Show charts

Ask similar question → RAG hit

Final summary

Notes

Designed for use with Supabase + pgvector

Uses local embeddings (Ollama) for privacy

Works with any tabular CSV dataset

All caches and memory are stored per user session

License

MIT License
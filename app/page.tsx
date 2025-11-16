"use client"

import { useState } from "react"
import { ChatInterface } from "@/components/chat-interface"
import { CSVUpload } from "@/components/csv-upload"
import { SchemaViewer } from "@/components/schema-viewer"
import { Database, Sparkles } from "lucide-react"

interface UploadedTableInfo {
  tableName: string
  columns: string[]
  rowCount: number
  sessionId: string
  fileName?: string
}

export default function Home() {
  const [uploadedTables, setUploadedTables] = useState<UploadedTableInfo[]>([])
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null)

  const hasData = uploadedTables.length > 0
  const selectedTable = uploadedTables.find((t) => t.tableName === selectedTableName) ?? uploadedTables[0] ?? null

  const handleUploadComplete = (data: {
    tableName: string
    columns: string[]
    rowCount: number
    sessionId: string
  }) => {
    console.log("[v0] Upload complete in page, session ID:", data.sessionId)
    setUploadedTables((prev) => {
      const next: UploadedTableInfo[] = [...prev, { ...data }]
      return next
    })
    setSelectedTableName(data.tableName)
  }

  const handleReset = () => {
    setUploadedTables([])
    setSelectedTableName(null)
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-80 border-r border-border bg-card flex flex-col">
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-secondary">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Data Chat</h1>
              <p className="text-xs text-muted-foreground">AI-Powered Analytics</p>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {hasData ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Uploaded Tables</h3>
                <div className="space-y-2">
                  {uploadedTables.map((table) => {
                    const isActive = selectedTable?.tableName === table.tableName
                    return (
                      <button
                        key={table.tableName}
                        onClick={() => setSelectedTableName(table.tableName)}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                          isActive
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-card hover:border-primary/50"
                        }`}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium truncate">{table.tableName}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {table.rowCount.toLocaleString()} rows · {table.columns.length} columns
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <SchemaViewer tableName={selectedTable?.tableName} />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Get Started</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Upload a CSV file to begin analyzing your data with natural language queries.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Database className="w-3 h-3" />
            <span>Powered by AI</span>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col">
        {!hasData ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-2xl w-full space-y-8">
              <div className="text-center space-y-4">
                <h2 className="text-4xl font-bold text-foreground tracking-tight">Ask questions about your data</h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Upload any CSV file and start querying it with natural language. No SQL knowledge required.
                </p>
              </div>

              <CSVUpload onUploadComplete={handleUploadComplete} />
            </div>
          </div>
        ) : (
          <ChatInterface
            tableName={selectedTable?.tableName}
            sessionId={selectedTable?.sessionId}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  )
}

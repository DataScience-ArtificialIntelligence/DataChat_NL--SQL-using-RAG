"use client"

import { Card } from "@/components/ui/card"
import { User, Bot, Code2, TableIcon, AlertCircle, BugPlay } from "lucide-react"
import type { Message } from "@/lib/types"
import { CodeBlock } from "@/components/code-block"
import { ResultsTable } from "@/components/results-table"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { DataChart } from "@/components/data-chart"

interface ChatMessageProps {
  message: Message
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user"
  const [explain, setExplain] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExplain() {
    if (!message.sql) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: message.sql }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || "Explain failed")
      } else {
        setExplain(data.explainPlan)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Explain failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`flex gap-4 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Bot className="w-5 h-5 text-primary" />
        </div>
      )}

      <div className={`flex-1 max-w-3xl space-y-3 ${isUser ? "flex flex-col items-end" : ""}`}>
        {/* Message Content */}
        <Card className={`p-4 ${isUser ? "bg-primary text-primary-foreground" : "bg-card"}`}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        </Card>

        {/* SQL Query */}
        {message.sql && (
          <Card className="p-4 bg-muted/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Generated SQL</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 bg-transparent h-7 px-2 text-xs"
                onClick={handleExplain}
                disabled={loading}
              >
                <BugPlay className="w-3 h-3" />
                {loading ? "Explaining..." : "Explain Plan"}
              </Button>
            </div>
            <CodeBlock code={message.sql} language="sql" />
            {error && <div className="text-xs text-destructive">{error}</div>}
            {explain && (
              <div className="mt-2">
                <span className="text-xs font-medium text-muted-foreground">Explain (JSON)</span>
                <CodeBlock code={JSON.stringify(explain, null, 2)} language="json" />
              </div>
            )}
          </Card>
        )}

        {/* Results */}
        {message.results && message.results.length > 0 && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <TableIcon className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Results ({message.results.length} rows)</span>
            </div>
            <ResultsTable data={message.results} />
            <DataChart data={message.results} sql={message.sql} summary={message.content} />
          </Card>
        )}

        {/* Error */}
        {message.error && (
          <Card className="p-4 bg-destructive/10 border-destructive/20">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <span className="text-sm text-destructive">{message.error}</span>
            </div>
          </Card>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
    </div>
  )
}

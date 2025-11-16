"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Play, Loader2 } from "lucide-react"
import { ResultsTable } from "@/components/results-table"
import type { QueryResult } from "@/lib/types"

export function QueryTester() {
  const [sql, setSql] = useState("")
  const [results, setResults] = useState<QueryResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleExecute = async () => {
    if (!sql.trim()) return

    setIsLoading(true)
    setError(null)
    setResults(null)

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || "Query execution failed")
        return
      }

      setResults(data.results)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">SQL Query</label>
            <Button onClick={handleExecute} disabled={isLoading || !sql.trim()} size="sm">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              Execute
            </Button>
          </div>
          <Textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="SELECT * FROM customers LIMIT 10"
            className="font-mono text-sm min-h-[120px]"
          />
        </div>
      </Card>

      {error && (
        <Card className="p-4 bg-destructive/10 border-destructive/20">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {results && (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-foreground mb-3">Results ({results.length} rows)</h3>
          <ResultsTable data={results} />
        </Card>
      )}
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Table2, ChevronDown, ChevronRight, Database } from "lucide-react"
import type { TableSchema } from "@/lib/types"

interface SchemaViewerProps {
  tableName?: string
}

export function SchemaViewer({ tableName }: SchemaViewerProps) {
  const [schema, setSchema] = useState<TableSchema | null>(null)
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const url = tableName ? `/api/schema?table=${tableName}` : "/api/schema"
    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        setSchema(data)
        // Auto-expand all tables on load
        if (data) {
          setExpandedTables(new Set(Object.keys(data)))
        }
      })
      .catch((err) => console.error("[v0] Failed to load schema:", err))
      .finally(() => setIsLoading(false))
  }, [tableName])

  const toggleTable = (tableName: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev)
      if (next.has(tableName)) {
        next.delete(tableName)
      } else {
        next.add(tableName)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Schema</h3>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 animate-pulse">
          <p className="text-xs text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!schema || Object.keys(schema).length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Schema</h3>
        </div>
        <div className="p-4 rounded-lg bg-muted/50">
          <p className="text-xs text-muted-foreground">No schema available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-4">
        <Database className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Schema</h3>
      </div>

      {Object.entries(schema).map(([tableName, tableInfo]) => {
        const isExpanded = expandedTables.has(tableName)
        return (
          <div
            key={tableName}
            className="rounded-lg border border-border bg-card overflow-hidden transition-all hover:border-primary/50"
          >
            <button
              onClick={() => toggleTable(tableName)}
              className="w-full p-3 flex items-center gap-2 hover:bg-muted/30 transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              )}
              <Table2 className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-sm font-semibold text-foreground truncate">{tableName}</span>
            </button>
            {isExpanded && (
              <div className="px-3 pb-3 space-y-3 animate-in">
                <p className="text-xs text-muted-foreground leading-relaxed pl-6">{tableInfo.description}</p>
                <div className="space-y-1.5 pl-6">
                  <p className="text-xs font-semibold text-foreground mb-2">Columns:</p>
                  {tableInfo.columns.map((column) => (
                    <div key={column.name} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      <span className="font-mono text-xs text-foreground">{column.name} ({column.dataType})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

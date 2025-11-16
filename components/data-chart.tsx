"use client"

import type { QueryResult } from "@/lib/types"
import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

type ChartType = "bar" | "line" | "stacked"

interface DataChartProps {
  data: QueryResult[]
  sql?: string
  summary?: string
}

export function DataChart({ data, sql, summary }: DataChartProps) {
  const { numericColumns, allColumns } = useMemo(() => {
    if (!data || data.length === 0) {
      return { numericColumns: [] as string[], allColumns: [] as string[] }
    }

    const sample = data[0]
    const cols = Object.keys(sample)
    const numeric = cols.filter((col) => {
      const value = sample[col]
      if (value === null || value === undefined) return false
      const n = typeof value === "number" ? value : Number(value)
      return !Number.isNaN(n)
    })

    return { numericColumns: numeric, allColumns: cols }
  }, [data])

  const [chartType, setChartType] = useState<ChartType>("bar")

  const { initialX, initialY } = useMemo(() => {
    const text = `${sql || ""} ${summary || ""}`.toLowerCase()

    const pick = (candidates: string[]): string | undefined => {
      return candidates.find((c) => allColumns.some((col) => col.toLowerCase() === c))
    }

    let x: string | undefined
    let y: string | undefined

    // Heuristic: common pairs
    if (text.includes("score") && text.includes("rank")) {
      x = pick(["score", "rank"]) ?? allColumns[0]
      y = pick(["rank", "score"]) ?? numericColumns[0]
    } else if (text.includes("date")) {
      x = pick(["date", "created_at"]) ?? allColumns[0]
      y = numericColumns[0]
    }

    if (!x) {
      x = allColumns[0]
    }
    if (!y) {
      y = numericColumns[0]
    }

    return { initialX: x, initialY: y }
  }, [allColumns, numericColumns, sql, summary])

  const [xKey, setXKey] = useState<string | undefined>(() => initialX)
  const [yKey, setYKey] = useState<string | undefined>(() => initialY)

  if (!data || data.length === 0 || numericColumns.length === 0 || !allColumns.length) {
    return null
  }

  const safeXKey = xKey && allColumns.includes(xKey) ? xKey : allColumns[0]
  const safeYKey = yKey && numericColumns.includes(yKey) ? yKey : numericColumns[0]

  // For stacked charts, use up to 3 numeric series
  const stackedKeys = numericColumns.filter((c) => c !== safeXKey).slice(0, 3)

  return (
    <Card className="mt-3 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs font-medium text-muted-foreground">Visualization</p>
        <div className="flex items-center gap-2 text-xs flex-wrap justify-end">
          <span className="text-muted-foreground">Type:</span>
          <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bar" className="text-xs">
                Bar
              </SelectItem>
              <SelectItem value="line" className="text-xs">
                Line
              </SelectItem>
              <SelectItem value="stacked" className="text-xs">
                Stacked Bar
              </SelectItem>
            </SelectContent>
          </Select>

          <span className="text-muted-foreground ml-2">X:</span>
          <Select value={safeXKey} onValueChange={setXKey}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue placeholder="X axis" />
            </SelectTrigger>
            <SelectContent>
              {allColumns.map((col) => (
                <SelectItem key={col} value={col} className="text-xs">
                  {col}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-muted-foreground ml-2">Y:</span>
          <Select value={safeYKey} onValueChange={setYKey}>
            <SelectTrigger className="h-7 w-32 text-xs">
              <SelectValue placeholder="Y axis" />
            </SelectTrigger>
            <SelectContent>
              {numericColumns.map((col) => (
                <SelectItem key={col} value={col} className="text-xs">
                  {col}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "line" ? (
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey={safeXKey} tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={40} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip wrapperStyle={{ fontSize: 10 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey={safeYKey} stroke="#4f46e5" strokeWidth={2} dot={false} />
            </LineChart>
          ) : chartType === "stacked" && stackedKeys.length > 0 ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey={safeXKey} tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={40} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip wrapperStyle={{ fontSize: 10 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {stackedKeys.map((key, idx) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="stack"
                  fill={["#4f46e5", "#22c55e", "#e11d48"][idx % 3]}
                  radius={idx === stackedKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey={safeXKey} tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={40} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip wrapperStyle={{ fontSize: 10 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey={safeYKey} fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CSVUploadProps {
  onUploadComplete: (data: { tableName: string; columns: string[]; rowCount: number; sessionId: string }) => void
}

export function CSVUpload({ onUploadComplete }: CSVUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const processFile = async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      setError("Please upload a CSV file")
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload-csv", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json()

        // Check if this is a setup issue
        if (errorData.setupRequired) {
          setError(
            "⚠️ Database Setup Required: The SQL functions are not installed. " +
              "Please run the setup script from the README in your Supabase SQL Editor, then try again.",
          )
        } else {
          setError(errorData.error || "Upload failed")
        }
        return
      }

      const result = await response.json()
      console.log("[v0] Upload complete, session ID:", result.sessionId)
      onUploadComplete(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      processFile(file)
    }
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative rounded-xl border-2 border-dashed transition-all duration-200
          ${isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border bg-card/50"}
          ${isUploading ? "opacity-50 pointer-events-none" : "hover:border-primary/50 hover:bg-card"}
        `}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isUploading}
        />

        <div className="p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            {isUploading ? (
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-primary" />
            )}
          </div>

          <h3 className="text-lg font-semibold text-foreground mb-2">
            {isUploading ? "Uploading..." : "Upload your CSV file"}
          </h3>

          <p className="text-sm text-muted-foreground mb-4">Drag and drop your file here, or click to browse</p>

          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Supports CSV files up to 10MB (max 50k rows)</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  )
}

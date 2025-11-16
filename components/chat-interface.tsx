"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Loader2, AlertCircle, Sparkles, RotateCcw, Trash2 } from "lucide-react"
import { ChatMessage } from "@/components/chat-message"
import type { Message } from "@/lib/types"

interface ChatInterfaceProps {
  tableName?: string
  sessionId?: string
  onReset?: () => void
}

export function ChatInterface({ tableName, sessionId, onReset }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [hasApiKeyError, setHasApiKeyError] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleClearChat = () => {
    setMessages([])
    setInput("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, history: messages, tableName, sessionId }),
      })

      const data = await response.json()

      if (!response.ok) {
        console.error("[v0] Chat API error:", data)

        if (
          data.error === "missing_api_key" ||
          data.error === "invalid_api_key" ||
          data.error === "invalid_api_key_format"
        ) {
          setHasApiKeyError(true)
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.content || "Sorry, I encountered an error processing your request.",
          error: data.error,
          timestamp: new Date(),
        }

        setMessages((prev) => [...prev, assistantMessage])
        return
      }

      if (
        data.error === "missing_api_key" ||
        data.error === "invalid_api_key" ||
        data.error === "invalid_api_key_format"
      ) {
        setHasApiKeyError(true)
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.content,
        sql: data.sql,
        results: data.results,
        error: data.error,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error("[v0] Chat error:", error)
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content:
          "Sorry, I encountered an error processing your request. Please make sure you've run the database setup script.",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const exampleQuestions = [
    "Show me the first 10 rows",
    "What columns are in this dataset?",
    "Give me summary statistics",
    "Show me unique values in each column",
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="border-b border-border p-6 bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Chat with your data</h2>
              <p className="text-sm text-muted-foreground">Ask questions in plain English</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearChat}
              disabled={messages.length === 0}
              className="gap-2 bg-transparent"
            >
              <RotateCcw className="w-4 h-4" />
              Clear Chat
            </Button>
            {onReset && (
              <Button variant="outline" size="sm" onClick={onReset} className="gap-2 bg-transparent">
                <Trash2 className="w-4 h-4" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {hasApiKeyError && (
          <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-3 animate-in">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-destructive mb-1">Groq API Key Required</p>
              <p className="text-muted-foreground leading-relaxed">
                Add your Groq API key in the <strong>Vars</strong> section. Get one from{" "}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-medium"
                >
                  console.groq.com/keys
                </a>
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-xl space-y-6">
              <div className="space-y-3">
                <h3 className="text-2xl font-bold text-foreground">Ready to explore your data</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Ask questions in natural language and I'll convert them to SQL queries and show you the results.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">Try asking:</p>
                <div className="grid grid-cols-2 gap-2">
                  {exampleQuestions.map((question, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(question)}
                      className="p-3 text-left text-sm text-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors border border-border hover:border-primary/50"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-6 bg-card/50 backdrop-blur-sm">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your data..."
            className="min-h-[60px] resize-none bg-background"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSubmit(e)
              }
            }}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            className="h-[60px] w-[60px] bg-primary hover:bg-primary/90 transition-all"
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </Button>
        </form>
      </div>
    </div>
  )
}

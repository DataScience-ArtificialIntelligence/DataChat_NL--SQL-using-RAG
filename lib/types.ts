export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  sql?: string
  results?: QueryResult[]
  error?: string
  timestamp: Date
}

export interface QueryResult {
  [key: string]: any
}

export interface TableSchema {
  [tableName: string]: {
    columns: string[]
    description: string
  }
}

export interface ChatState {
  messages: Message[]
  isLoading: boolean
}

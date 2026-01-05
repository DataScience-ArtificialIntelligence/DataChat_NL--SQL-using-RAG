/**
 * Configuration and Environment Variable Validation
 * 
 * This module validates all required environment variables at application startup
 * to prevent runtime failures due to missing or invalid configuration.
 */

interface Config {
  // Database Configuration (at least one required)
  database: {
    type: 'supabase' | 'neon' | 'custom'
    supabaseUrl?: string
    supabaseAnonKey?: string
    supabaseServiceRoleKey?: string
    postgresUrl?: string
  }
  
  // AI Configuration (required)
  ai: {
    groqApiKey: string
  }
  
  // Optional Configuration
  optional: {
    embeddingDim: number
    embeddingModel: string
    dbAdapter?: string
    nodeEnv: string
  }
}

const config: Config = {
  database: {
    type: 'supabase',
  },
  ai: {
    groqApiKey: '',
  },
  optional: {
    embeddingDim: 768,
    embeddingModel: 'nomic-embed-text',
    nodeEnv: process.env.NODE_ENV || 'development',
  },
}

/**
 * Validates that at least one database configuration is provided
 */
function validateDatabaseConfig(): void {
  const hasSupabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY

  const hasNeon = process.env.POSTGRES_URL

  if (!hasSupabase && !hasNeon) {
    throw new Error(
      `Missing database configuration. Provide either:
1. NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Supabase)
   OR
2. POSTGRES_URL (Neon/Custom PostgreSQL)

See env.example for configuration details.`
    )
  }

  // Validate Supabase config if provided
  if (hasSupabase) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is required when using Supabase')
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required when using Supabase')
    }
    
    // Validate URL format
    try {
      new URL(process.env.NEXT_PUBLIC_SUPABASE_URL)
    } catch {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL is not a valid URL')
    }

    config.database.type = 'supabase'
    config.database.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    config.database.supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    config.database.supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  }

  // Validate Neon/PostgreSQL config if provided
  if (hasNeon) {
    if (!process.env.POSTGRES_URL) {
      throw new Error('POSTGRES_URL is required when using Neon/Custom PostgreSQL')
    }
    
    // Validate PostgreSQL URL format (should start with postgresql://)
    if (!process.env.POSTGRES_URL.startsWith('postgresql://')) {
      throw new Error('POSTGRES_URL must start with "postgresql://"')
    }

    config.database.type = 'neon'
    config.database.postgresUrl = process.env.POSTGRES_URL
  }
}

/**
 * Validates Groq API key configuration
 */
function validateAiConfig(): void {
  const apiKey =
    process.env.GROQ_API_KEY ||
    process.env.NEXT_PUBLIC_GROQ_API_KEY ||
    process.env.GROQ ||
    process.env.GROQ_KEY

  if (!apiKey) {
    throw new Error(
      `Missing GROQ_API_KEY. Get your API key from https://console.groq.com/keys
Set it as GROQ_API_KEY in your .env.local file.`
    )
  }

  if (!apiKey.startsWith('gsk_')) {
    throw new Error(
      `Invalid GROQ_API_KEY format. API key should start with "gsk_".
Get your API key from https://console.groq.com/keys`
    )
  }

  config.ai.groqApiKey = apiKey.trim()
}

/**
 * Validates optional configuration with defaults
 */
function validateOptionalConfig(): void {
  // Embedding dimension
  if (process.env.EMBEDDING_DIM) {
    const dim = parseInt(process.env.EMBEDDING_DIM, 10)
    if (isNaN(dim) || dim <= 0) {
      throw new Error(`Invalid EMBEDDING_DIM: must be a positive number, got "${process.env.EMBEDDING_DIM}"`)
    }
    config.optional.embeddingDim = dim
  }

  // Embedding model
  if (process.env.EMBEDDING_MODEL) {
    config.optional.embeddingModel = process.env.EMBEDDING_MODEL
  }

  // Database adapter override
  if (process.env.V0_DB_ADAPTER || process.env.DB_ADAPTER) {
    const adapter = (process.env.V0_DB_ADAPTER || process.env.DB_ADAPTER || '').toLowerCase()
    if (adapter !== 'supabase' && adapter !== 'neon') {
      console.warn(
        `[config] Invalid V0_DB_ADAPTER: "${adapter}". Valid values are "supabase" or "neon". Ignoring.`
      )
    } else {
      config.optional.dbAdapter = adapter
    }
  }
}

/**
 * Validates all environment variables and initializes configuration
 * Call this function at application startup (e.g., in a middleware or app initialization)
 * 
 * @throws Error if required environment variables are missing or invalid
 */
export function validateEnv(): Config {
  try {
    validateDatabaseConfig()
    validateAiConfig()
    validateOptionalConfig()

    console.log('[config] ✅ Environment variables validated successfully')
    console.log(`[config] Database: ${config.database.type}`)
    console.log(`[config] Node environment: ${config.optional.nodeEnv}`)

    return config
  } catch (error) {
    console.error('[config] ❌ Environment variable validation failed:')
    console.error(error instanceof Error ? error.message : error)
    throw error
  }
}

/**
 * Get the validated configuration
 * Note: validateEnv() must be called first
 */
export function getConfig(): Config {
  return config
}

/**
 * Runtime validation helper for API routes
 * Validates critical env vars that might be accessed at runtime
 */
export function validateRuntimeEnv(): void {
  // Quick validation for runtime (doesn't throw, just warns)
  const apiKey =
    process.env.GROQ_API_KEY ||
    process.env.NEXT_PUBLIC_GROQ_API_KEY ||
    process.env.GROQ ||
    process.env.GROQ_KEY

  if (!apiKey) {
    console.warn('[config] ⚠️ GROQ_API_KEY not found at runtime')
  }

  const hasDb =
    (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    process.env.POSTGRES_URL

  if (!hasDb) {
    console.warn('[config] ⚠️ Database configuration not found at runtime')
  }
}

// Auto-validate on module load (server-side only)
if (typeof window === 'undefined') {
  try {
    validateEnv()
  } catch (error) {
    // In Next.js, we want to fail fast during build/startup
    // But we don't want to crash during development if .env.local is missing
    if (process.env.NODE_ENV === 'production') {
      throw error
    } else {
      console.warn('[config] ⚠️ Environment validation failed, but continuing in development mode')
      console.warn('[config] Make sure to set up .env.local with required variables')
    }
  }
}

export default config


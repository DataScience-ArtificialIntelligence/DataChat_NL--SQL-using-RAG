import { cookies } from "next/headers"
import { nanoid } from "nanoid"

const SESSION_COOKIE_NAME = "datachat_session"
const SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours

export interface UserSession {
  id: string
  createdAt: number
}

export async function getOrCreateSession(): Promise<UserSession> {
  const cookieStore = await cookies()
  const existingSession = cookieStore.get(SESSION_COOKIE_NAME)

  console.log("[v0] Session cookie value:", existingSession?.value)

  if (existingSession) {
    try {
      const session = JSON.parse(existingSession.value) as UserSession

      // Check if session is still valid (not expired)
      if (Date.now() - session.createdAt < SESSION_DURATION) {
        console.log("[v0] Reusing existing session:", session.id)
        return session
      } else {
        console.log("[v0] Session expired, creating new one")
      }
    } catch (error) {
      console.error("[v0] Failed to parse session cookie:", error)
    }
  } else {
    console.log("[v0] No existing session found, creating new one")
  }

  // Create new session
  const newSession: UserSession = {
    id: nanoid(12), // Short, URL-safe unique ID
    createdAt: Date.now(),
  }

  console.log("[v0] Created new session:", newSession.id)

  // Set session cookie
  cookieStore.set(SESSION_COOKIE_NAME, JSON.stringify(newSession), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION / 1000,
    path: "/", // Explicitly set path to ensure cookie is available across all routes
  })

  return newSession
}

export function getSessionFromId(sessionId: string): UserSession {
  return {
    id: sessionId,
    createdAt: Date.now(),
  }
}

export function getTableName(originalName: string, sessionId: string): string {
  // Create isolated table name: session_[sessionId]_[cleanedFileName]
  const cleanName = originalName
    .replace(/\.[^/.]+$/, "") // Remove extension
    .replace(/[^a-zA-Z0-9_]/g, "_") // Replace invalid chars
    .toLowerCase()
    .slice(0, 30) // Limit length

  return `session_${sessionId}_${cleanName}`
}

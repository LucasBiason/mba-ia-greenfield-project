"use client"

import * as React from "react"

export type SessionState = {
  userId: string
  email: string
  channelSlug: string
  isLoggedIn: boolean
}

const defaultSession: SessionState = {
  userId: "",
  email: "",
  channelSlug: "",
  isLoggedIn: false,
}

const SessionContext = React.createContext<SessionState>(defaultSession)

type SessionProviderProps = {
  initialSession: SessionState
  children: React.ReactNode
}

function SessionProvider({ initialSession, children }: SessionProviderProps) {
  const [session, setSession] = React.useState<SessionState>(initialSession)
  const [prevInitial, setPrevInitial] = React.useState<SessionState>(initialSession)

  if (prevInitial !== initialSession) {
    setPrevInitial(initialSession)
    setSession(initialSession)
  }

  // In real browser runtime, verify with /api/auth/session on mount to stay in sync with server expiration
  React.useEffect(() => {
    const isTest = typeof process !== "undefined" && process.env.NODE_ENV === "test"
    if (isTest || typeof window === "undefined") {
      return
    }

    let active = true
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return
        if (data.isLoggedIn) {
          setSession({
            userId: data.userId || "",
            email: data.email || "",
            channelSlug: data.channelSlug || "",
            isLoggedIn: true,
          })
        } else {
          setSession({
            userId: "",
            email: "",
            channelSlug: "",
            isLoggedIn: false,
          })
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  )
}

function useSession() {
  return React.useContext(SessionContext)
}

export { SessionProvider, SessionContext, useSession }

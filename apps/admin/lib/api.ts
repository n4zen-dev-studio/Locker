import { getAdminEnv } from "@locker/config"

export type ApiClient = {
  token: string | null
  setToken: (token: string | null) => void
  request: <T>(path: string, init?: RequestInit) => Promise<T>
}

const TOKEN_KEY = "locker.admin.token"
const USER_KEY = "locker.admin.user"

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return
  if (token) window.localStorage.setItem(TOKEN_KEY, token)
  else window.localStorage.removeItem(TOKEN_KEY)
}

export function setStoredUser(user: unknown | null) {
  if (typeof window === "undefined") return
  if (user) window.localStorage.setItem(USER_KEY, JSON.stringify(user))
  else window.localStorage.removeItem(USER_KEY)
}

export function getStoredUser<T>(): T | null {
  if (typeof window === "undefined") return null
  const raw = window.localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function createApiClient(token: string | null): ApiClient {
  const env = getAdminEnv()
  return {
    token,
    setToken: setStoredToken,
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const headers = new Headers(init.headers || {})
      headers.set("content-type", "application/json")
      if (token) headers.set("Authorization", `Bearer ${token}`)
      const res = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}${path}`, {
        ...init,
        headers,
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Request failed: ${res.status}`)
      }
      return res.json() as Promise<T>
    },
  }
}

import { DEFAULT_API_BASE_URL } from "../config"
import { getToken } from "../auth/tokenStore"
import { getAccount } from "../storage/accountRepo"
import { getServerUrl } from "../storage/serverConfigRepo"

export type ApiRequestOptions = {
  token?: string | null
  baseUrl?: string
}

export function normalizeApiBaseUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
}

export function getApiBaseUrl(override?: string): string {
  if (override) return normalizeApiBaseUrl(override)
  const stored = getServerUrl()
  if (stored) return normalizeApiBaseUrl(stored)
  const account = getAccount()
  if (account?.apiBase) return normalizeApiBaseUrl(account.apiBase)
  return normalizeApiBaseUrl(DEFAULT_API_BASE_URL)
}

async function buildHeaders(init: RequestInit, token: string | null, hasBody: boolean): Promise<Headers> {
  const headers = new Headers(init.headers || {})
  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }
  if (token) headers.set("authorization", `Bearer ${token}`)
  return headers
}

export async function fetchJson<T>(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<T> {
  const token = options.token ?? (await getToken())
  const baseUrl = getApiBaseUrl(options.baseUrl)
  const headers = await buildHeaders(init, token, !!init.body)
  const url = `${baseUrl}${path}`
  const method = (init.method || "GET").toUpperCase()
  let res: Response
  try {
    res = await fetch(url, { ...init, headers })
  } catch (err) {
    if (__DEV__) console.log("[api] network error", { url })
    throw new Error("Cannot reach server. Check Server URL and Wi-Fi.")
  }
  if (!res.ok) {
    const text = await safeReadBody(res)
    if (res.status === 401) throw new Error("Session expired. Please link again.")
    if (res.status === 403) throw new Error("No access to this vault.")
    throw new Error(`[HTTP ${res.status}] ${method} ${url} :: ${text}`)
  }
  return res.json() as Promise<T>
}

export async function fetchRaw(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<Uint8Array> {
  const token = options.token ?? (await getToken())
  const baseUrl = getApiBaseUrl(options.baseUrl)
  const headers = await buildHeaders(init, token, !!init.body)
  const url = `${baseUrl}${path}`
  const method = (init.method || "GET").toUpperCase()
  let res: Response
  try {
    res = await fetch(url, { ...init, headers })
  } catch (err) {
    if (__DEV__) console.log("[api] network error", { url })
    throw new Error("Cannot reach server. Check Server URL and Wi-Fi.")
  }
  if (!res.ok) {
    const text = await safeReadBody(res)
    if (res.status === 401) throw new Error("Session expired. Please link again.")
    if (res.status === 403) throw new Error("No access to this vault.")
    throw new Error(`[HTTP ${res.status}] ${method} ${url} :: ${text}`)
  }
  const buffer = await res.arrayBuffer()
  return new Uint8Array(buffer)
}

async function safeReadBody(res: Response): Promise<string> {
  try {
    const text = await res.text()
    return text || "<empty>"
  } catch {
    return "<unreadable>"
  }
}

export function isNotFound(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.message.includes("[HTTP 404]")
}

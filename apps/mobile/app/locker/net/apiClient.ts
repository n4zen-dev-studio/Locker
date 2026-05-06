import { Platform } from "react-native"
import { DEFAULT_API_BASE_URL } from "../config"
import { getToken } from "../auth/tokenStore"
import { getAccount } from "../storage/accountRepo"
import { getServerUrl } from "../storage/serverConfigRepo"
import { ApiError, ApiErrorKind } from "./errors"

export type ApiRequestOptions = {
  token?: string | null
  baseUrl?: string
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Record<string, string>
  auth?: "auto" | "required" | "none"
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
  const platformDefault = Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000"
  return normalizeApiBaseUrl(DEFAULT_API_BASE_URL || platformDefault)
}

async function buildHeaders(
  init: RequestInit,
  token: string | null,
  hasBody: boolean,
  extraHeaders?: Record<string, string>,
): Promise<Headers> {
  const headers = new Headers(init.headers || {})
  const account = getAccount()
  if (hasBody && !headers.has("content-type")) {
    headers.set("content-type", "application/json")
  }
  if (token) headers.set("authorization", `Bearer ${token}`)
  if (account?.device.id && !headers.has("x-device-id")) {
    headers.set("x-device-id", account.device.id)
  }
  if (extraHeaders) {
    Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value))
  }
  return headers
}

function buildApiError(
  kind: ApiErrorKind,
  message: string,
  status?: number,
  details?: unknown,
): ApiError {
  return new ApiError(kind, message, { status, details })
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  options: ApiRequestOptions,
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 15_000
  const controller = new AbortController()
  const signal = options.signal
  let timeoutFired = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener("abort", () => controller.abort(), { once: true })
  }

  timeoutId = setTimeout(() => {
    timeoutFired = true
    controller.abort()
  }, timeoutMs)

  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err: any) {
    if (timeoutFired) {
      throw buildApiError("TIMEOUT", "Request timed out")
    }
    if (err?.name === "AbortError") {
      throw buildApiError("NETWORK", "Request cancelled")
    }
    throw buildApiError("NETWORK", "Cannot reach server. Check Server URL and Wi-Fi.", undefined, err)
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export async function fetchJson<T>(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<T> {
  const authMode = options.auth ?? "auto"
  const baseUrl = getApiBaseUrl(options.baseUrl)
  const url = `${baseUrl}${path}`
  const method = (init.method || "GET").toUpperCase()

  const token =
    authMode === "none" ? null : (options.token ?? (await getToken()))

  if (authMode === "required" && !token) {
    throw buildApiError("AUTH", "Not linked. Please link this device again.")
  }

  const headers = await buildHeaders(init, token ?? undefined, !!init.body, options.headers)

  let res: Response
  try {
    res = await fetchWithTimeout(url, { ...init, headers }, options)
  } catch (err) {
    if (__DEV__) console.log("[api] network error", { url })
    throw err
  }

  if (!res.ok) {
    const text = await safeReadBody(res)

    if (res.status === 401) {
      // Only show "link again" for authenticated calls.
      if (authMode === "none") {
        throw buildApiError("AUTH", text || "Request not authorized.", res.status)
      }
      throw buildApiError("AUTH", "Session expired. Please link again.", res.status)
    }

    if (res.status === 403) throw buildApiError("FORBIDDEN", "No access to this vault.", res.status)

    // Optional: nicer pairing errors if API uses these codes
    if (res.status === 409) throw buildApiError("BAD_RESPONSE", "Link code already used. Generate a new QR.", res.status)
    if (res.status === 410) throw buildApiError("BAD_RESPONSE", "Link code expired. Generate a new QR.", res.status)
    if (res.status === 404) throw buildApiError("NOT_FOUND", text || "Not found", res.status)

    throw buildApiError("BAD_RESPONSE", `[HTTP ${res.status}] ${method} ${url} :: ${text}`, res.status)
  }

  try {
    return (await res.json()) as T
  } catch (err) {
    throw buildApiError("BAD_RESPONSE", "Failed to parse JSON response", res.status, err)
  }
}

export async function fetchBytes(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<Uint8Array> {
  const authMode = options.auth ?? "auto"
  const baseUrl = getApiBaseUrl(options.baseUrl)
  const url = `${baseUrl}${path}`
  const method = (init.method || "GET").toUpperCase()

  const token =
    authMode === "none" ? null : (options.token ?? (await getToken()))

  if (authMode === "required" && !token) {
    throw buildApiError("AUTH", "Not linked. Please link this device again.")
  }

  const headers = await buildHeaders(init, token ?? undefined, !!init.body, options.headers)

  let res: Response
  try {
    res = await fetchWithTimeout(url, { ...init, headers }, options)
  } catch (err) {
    if (__DEV__) console.log("[api] network error", { url })
    throw err
  }

  if (!res.ok) {
    const text = await safeReadBody(res)

    if (res.status === 401) {
      if (authMode === "none") {
        throw buildApiError("AUTH", text || "Request not authorized.", res.status)
      }
      throw buildApiError("AUTH", "Session expired. Please link again.", res.status)
    }

    if (res.status === 403) throw buildApiError("FORBIDDEN", "No access to this vault.", res.status)
    if (res.status === 409) throw buildApiError("BAD_RESPONSE", "Link code already used. Generate a new QR.", res.status)
    if (res.status === 410) throw buildApiError("BAD_RESPONSE", "Link code expired. Generate a new QR.", res.status)
    if (res.status === 404) throw buildApiError("NOT_FOUND", text || "Not found", res.status)

    throw buildApiError("BAD_RESPONSE", `[HTTP ${res.status}] ${method} ${url} :: ${text}`, res.status)
  }

  const buffer = await res.arrayBuffer()
  return new Uint8Array(buffer)
}

export async function putBytes(
  path: string,
  bytes: Uint8Array,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<void> {
  await fetchBytes(
    path,
    {
      ...init,
      method: init.method || "PUT",
      body: bytes as any,
    },
    {
      ...options,
      headers: { "content-type": "application/octet-stream", ...(options.headers ?? {}) },
    },
  )
}

export async function fetchRaw(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<Uint8Array> {
  return fetchBytes(path, init, options)
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
  if (err instanceof ApiError) return err.kind === "NOT_FOUND"
  return false
}

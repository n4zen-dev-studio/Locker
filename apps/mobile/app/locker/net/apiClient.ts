import { DEFAULT_API_BASE_URL } from "../config"
import { clearToken, getToken, setToken } from "../auth/tokenStore"
import { clearAccount, getAccount, setAccount } from "../storage/accountRepo"
import { getServerUrl } from "../storage/serverConfigRepo"
import { vaultSession } from "../session"
import { ApiError, ApiErrorKind } from "./errors"

export type ApiRequestOptions = {
  token?: string | null
  baseUrl?: string
  signal?: AbortSignal
  timeoutMs?: number
  headers?: Record<string, string>
  auth?: "auto" | "required" | "none"
}

type RefreshResponse = {
  token: string
  user: NonNullable<ReturnType<typeof getAccount>>["user"]
  device: NonNullable<ReturnType<typeof getAccount>>["device"]
}

let refreshInFlight: Promise<string> | null = null

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
  return normalizeApiBaseUrl(DEFAULT_API_BASE_URL || "https://vault-api.n4zen.dev")
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

async function clearRemoteAuthState() {
  clearAccount()
  await clearToken()
  vaultSession.clear()
}

async function refreshAuthSession(baseUrl: string, options: ApiRequestOptions): Promise<string> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const account = getAccount()
    const token = await getToken()
    if (!account?.device.id || !token) {
      await clearRemoteAuthState()
      throw buildApiError("AUTH", "Session expired. Please link again.", 401)
    }

    const headers = new Headers()
    headers.set("authorization", `Bearer ${token}`)
    headers.set("x-device-id", account.device.id)

    const res = await fetchWithTimeout(
      `${baseUrl}/v1/auth/refresh`,
      { method: "POST", headers },
      { ...options, auth: "none" },
    )

    if (!res.ok) {
      const text = await safeReadBody(res)
      if (res.status === 401 || res.status === 403) {
        await clearRemoteAuthState()
        throw buildApiError("AUTH", "Session expired. Please link again.", res.status, text)
      }
      throw buildApiError("BAD_RESPONSE", `[HTTP ${res.status}] POST ${baseUrl}/v1/auth/refresh :: ${text}`, res.status)
    }

    let data: RefreshResponse
    try {
      data = (await res.json()) as RefreshResponse
    } catch (err) {
      throw buildApiError("BAD_RESPONSE", "Failed to parse refresh response", res.status, err)
    }
    if (!data.token) throw buildApiError("BAD_RESPONSE", "Refresh response missing token", res.status)

    await setToken(data.token)
    setAccount({
      ...account,
      user: data.user,
      device: data.device,
      apiBase: baseUrl,
    })
    return data.token
  })().finally(() => {
    refreshInFlight = null
  })

  return refreshInFlight
}

function shouldTryAuthRecovery(status: number, authMode: ApiRequestOptions["auth"]): boolean {
  return authMode !== "none" && (status === 401 || status === 403)
}

function apiErrorForStatus(
  status: number,
  method: string,
  url: string,
  text: string,
  authMode: ApiRequestOptions["auth"],
): ApiError {
  if (status === 401) {
    if (authMode === "none") return buildApiError("AUTH", text || "Request not authorized.", status)
    return buildApiError("AUTH", "Session expired. Please link again.", status)
  }

  if (status === 403) return buildApiError("FORBIDDEN", "No access to this vault.", status)
  if (status === 409) return buildApiError("BAD_RESPONSE", "Link code already used. Generate a new QR.", status)
  if (status === 410) return buildApiError("BAD_RESPONSE", "Link code expired. Generate a new QR.", status)
  if (status === 404) return buildApiError("NOT_FOUND", text || "Not found", status)

  return buildApiError("BAD_RESPONSE", `[HTTP ${status}] ${method} ${url} :: ${text}`, status)
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

  let token =
    authMode === "none" ? null : (options.token ?? (await getToken()))

  if (authMode === "required" && !token) {
    throw buildApiError("AUTH", "Not linked. Please link this device again.")
  }

  let res: Response
  try {
    const headers = await buildHeaders(init, token, !!init.body, options.headers)
    res = await fetchWithTimeout(url, { ...init, headers }, options)
  } catch (err) {
    if (__DEV__) console.log("[api] network error", { url })
    throw err
  }

  if (!res.ok) {
    const text = await safeReadBody(res)
    if (shouldTryAuthRecovery(res.status, authMode)) {
      token = await refreshAuthSession(baseUrl, options)
      const retryHeaders = await buildHeaders(init, token, !!init.body, options.headers)
      const retry = await fetchWithTimeout(url, { ...init, headers: retryHeaders }, options)
      if (retry.ok) {
        try {
          return (await retry.json()) as T
        } catch (err) {
          throw buildApiError("BAD_RESPONSE", "Failed to parse JSON response", retry.status, err)
        }
      }
      const retryText = await safeReadBody(retry)
      throw apiErrorForStatus(retry.status, method, url, retryText, authMode)
    }
    throw apiErrorForStatus(res.status, method, url, text, authMode)
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

  let token =
    authMode === "none" ? null : (options.token ?? (await getToken()))

  if (authMode === "required" && !token) {
    throw buildApiError("AUTH", "Not linked. Please link this device again.")
  }

  let res: Response
  try {
    const headers = await buildHeaders(init, token, !!init.body, options.headers)
    res = await fetchWithTimeout(url, { ...init, headers }, options)
  } catch (err) {
    if (__DEV__) console.log("[api] network error", { url })
    throw err
  }

  if (!res.ok) {
    const text = await safeReadBody(res)
    if (shouldTryAuthRecovery(res.status, authMode)) {
      token = await refreshAuthSession(baseUrl, options)
      const retryHeaders = await buildHeaders(init, token, !!init.body, options.headers)
      const retry = await fetchWithTimeout(url, { ...init, headers: retryHeaders }, options)
      if (retry.ok) {
        const buffer = await retry.arrayBuffer()
        return new Uint8Array(buffer)
      }
      const retryText = await safeReadBody(retry)
      throw apiErrorForStatus(retry.status, method, url, retryText, authMode)
    }
    throw apiErrorForStatus(res.status, method, url, text, authMode)
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

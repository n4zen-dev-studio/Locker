import { DEFAULT_API_BASE_URL } from "../config"
import { getToken } from "../auth/tokenStore"
import { getAccount } from "../storage/accountRepo"

export type ApiRequestOptions = {
  token?: string | null
  baseUrl?: string
}

function resolveBaseUrl(override?: string): string {
  if (override) return override
  const account = getAccount()
  if (account?.apiBase) return account.apiBase
  return DEFAULT_API_BASE_URL
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
  const baseUrl = resolveBaseUrl(options.baseUrl)
  const headers = await buildHeaders(init, token, !!init.body)
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function fetchRaw(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {},
): Promise<Uint8Array> {
  const token = options.token ?? (await getToken())
  const baseUrl = resolveBaseUrl(options.baseUrl)
  const headers = await buildHeaders(init, token, !!init.body)
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  const buffer = await res.arrayBuffer()
  return new Uint8Array(buffer)
}

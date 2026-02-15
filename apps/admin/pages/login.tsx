import { FormEvent, useMemo, useState } from "react"
import { startAuthentication, startRegistration } from "@simplewebauthn/browser"
import { getAdminEnv } from "@locker/config"
import { createApiClient, setStoredToken, setStoredUser } from "../lib/api"
import { useRouter } from "next/router"

type User = { id: string; email?: string | null; displayName?: string | null }

export default function LoginPage() {
  const env = useMemo(() => getAdminEnv(), [])
  const router = useRouter()
  const api = useMemo(() => createApiClient(null), [])

  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [loginEmail, setLoginEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [devEmail, setDevEmail] = useState("")

  async function handleRegister(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const { userId, options } = await api.request<{ userId: string; options: any }>(
        "/v1/auth/webauthn/register/options",
        {
          method: "POST",
          body: JSON.stringify({ email: email || undefined, displayName: displayName || undefined })
        }
      )

      const response = await startRegistration(options)
      const verify = await api.request<{ token: string; user: User }>(
        "/v1/auth/webauthn/register/verify",
        { method: "POST", body: JSON.stringify({ userId, response }) }
      )
      setStoredToken(verify.token)
      setStoredUser(verify.user)
      router.push("/dashboard")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed"
      setError(message)
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const { userId, options } = await api.request<{ userId: string; options: any }>(
        "/v1/auth/webauthn/authenticate/options",
        {
          method: "POST",
          body: JSON.stringify({ email: loginEmail || undefined })
        }
      )
      const response = await startAuthentication(options)
      const verify = await api.request<{ token: string; user: User }>(
        "/v1/auth/webauthn/authenticate/verify",
        { method: "POST", body: JSON.stringify({ userId, response }) }
      )
      setStoredToken(verify.token)
      setStoredUser(verify.user)
      router.push("/dashboard")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed"
      setError(message)
    }
  }

  async function handleDiscoverableLogin() {
    setError(null)
    try {
      const { options } = await api.request<{ options: any }>(
        "/v1/auth/webauthn/authenticate/options/discoverable",
        { method: "POST", body: JSON.stringify({}) }
      )
      const response = await startAuthentication(options)
      const verify = await api.request<{ token: string; user: User }>(
        "/v1/auth/webauthn/authenticate/verify",
        { method: "POST", body: JSON.stringify({ response }) }
      )
      setStoredToken(verify.token)
      setStoredUser(verify.user)
      router.push("/dashboard")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed"
      setError(message)
    }
  }

  async function handleDevLogin(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const { token, user } = await api.request<{ token: string; user: User }>(
        "/v1/auth/dev-login",
        {
          method: "POST",
          body: JSON.stringify({ email: devEmail })
        }
      )
      setStoredToken(token)
      setStoredUser(user)
      router.push("/dashboard")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Dev login failed"
      setError(message)
    }
  }

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24, maxWidth: 540 }}>
      <h1>Locker Admin</h1>
      <p>API Base URL: {env.NEXT_PUBLIC_API_BASE_URL}</p>

      <section style={{ marginTop: 24 }}>
        <h2>Create Passkey</h2>
        <form onSubmit={handleRegister} style={{ display: "grid", gap: 12 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            style={{ padding: 8 }}
          />
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name (optional)"
            style={{ padding: 8 }}
          />
          <button type="submit" style={{ padding: "8px 12px" }}>
            Create Passkey
          </button>
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Sign in with Passkey</h2>
        <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
          <input
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            placeholder="Email"
            style={{ padding: 8 }}
          />
          <button type="submit" style={{ padding: "8px 12px" }}>
            Sign in
          </button>
        </form>
        <button onClick={handleDiscoverableLogin} style={{ padding: "8px 12px", marginTop: 8 }}>
          Sign in on this device
        </button>
      </section>

      {env.NEXT_PUBLIC_DEV_AUTH_ENABLED === "true" ? (
        <section style={{ marginTop: 24 }}>
          <h2>Dev Login</h2>
          <form onSubmit={handleDevLogin} style={{ display: "grid", gap: 12 }}>
            <input
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              placeholder="Email"
              style={{ padding: 8 }}
            />
            <button type="submit" style={{ padding: "8px 12px" }}>
              Dev Login
            </button>
          </form>
        </section>
      ) : null}

      {error ? <p style={{ color: "crimson", marginTop: 16 }}>{error}</p> : null}
    </main>
  )
}

import { FormEvent, useEffect, useMemo, useState } from "react"
import { getAdminEnv } from "@locker/config"

type PingState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: unknown }
  | { status: "error"; message: string }

type Vault = { id: string; name: string; ownerUserId: string; createdAt: string }

type User = { id: string; email: string }

export default function HomePage() {
  const env = useMemo(() => getAdminEnv(), [])
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [loginError, setLoginError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [ping, setPing] = useState<PingState>({ status: "idle" })
  const [meta, setMeta] = useState<unknown>(null)
  const [vaults, setVaults] = useState<Vault[]>([])
  const [vaultName, setVaultName] = useState("")
  const [vaultError, setVaultError] = useState<string | null>(null)

  useEffect(() => {
    const stored = window.localStorage.getItem("locker.admin.token")
    const storedUser = window.localStorage.getItem("locker.admin.user")
    if (stored) setToken(stored)
    if (storedUser) setUser(JSON.parse(storedUser) as User)
  }, [])

  async function handlePing() {
    setPing({ status: "loading" })
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}/health`)
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`)
      }
      const data = await res.json()
      setPing({ status: "success", data })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setPing({ status: "error", message })
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setLoginError(null)
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}/v1/auth/dev-login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email })
      })
      if (!res.ok) throw new Error(`Login failed: ${res.status}`)
      const data = await res.json()
      setToken(data.token)
      setUser(data.user)
      window.localStorage.setItem("locker.admin.token", data.token)
      window.localStorage.setItem("locker.admin.user", JSON.stringify(data.user))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed"
      setLoginError(message)
    }
  }

  async function loadMeta() {
    const res = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}/v1/meta`)
    if (!res.ok) throw new Error(`Meta error: ${res.status}`)
    setMeta(await res.json())
  }

  async function loadVaults() {
    if (!token) return
    const res = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}/v1/vaults`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error(`Vaults error: ${res.status}`)
    const data = await res.json()
    setVaults(data.vaults || [])
  }

  async function handleCreateVault(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    setVaultError(null)
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}/v1/vaults`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: vaultName })
      })
      if (!res.ok) throw new Error(`Create vault error: ${res.status}`)
      const data = await res.json()
      setVaults((prev) => [data.vault, ...prev])
      setVaultName("")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Create vault failed"
      setVaultError(message)
    }
  }

  if (!token) {
    return (
      <main style={{ fontFamily: "sans-serif", padding: 24, maxWidth: 480 }}>
        <h1>Locker Admin</h1>
        <p>API Base URL: {env.NEXT_PUBLIC_API_BASE_URL}</p>
        <form onSubmit={handleLogin} style={{ display: "grid", gap: 12 }}>
          <label>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <button type="submit" style={{ padding: "8px 12px" }}>
            Login (Dev)
          </button>
          {loginError ? <p style={{ color: "crimson" }}>{loginError}</p> : null}
        </form>
      </main>
    )
  }

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Locker Admin</h1>
      <p>API Base URL: {env.NEXT_PUBLIC_API_BASE_URL}</p>
      <p>Signed in as: {user?.email}</p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button onClick={handlePing} style={{ padding: "8px 12px" }}>
          Ping API
        </button>
        <button
          onClick={() => loadMeta().catch((e) => setPing({ status: "error", message: e.message }))}
          style={{ padding: "8px 12px" }}
        >
          Load Meta
        </button>
        <button
          onClick={() => loadVaults().catch((e) => setPing({ status: "error", message: e.message }))}
          style={{ padding: "8px 12px" }}
        >
          List Vaults
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {ping.status === "idle" && <p>Use the actions above.</p>}
        {ping.status === "loading" && <p>Loading...</p>}
        {ping.status === "error" && (
          <p style={{ color: "crimson" }}>
            Could not reach API. {ping.message}
          </p>
        )}
        {ping.status === "success" && (
          <pre
            style={{
              background: "#f5f5f5",
              padding: 12,
              borderRadius: 6
            }}
          >
            {JSON.stringify(ping.data, null, 2)}
          </pre>
        )}
      </div>

      {meta ? (
        <pre
          style={{
            background: "#f5f5f5",
            padding: 12,
            borderRadius: 6,
            marginTop: 16
          }}
        >
          {JSON.stringify(meta, null, 2)}
        </pre>
      ) : null}

      <section style={{ marginTop: 24, maxWidth: 520 }}>
        <h2>Create Vault</h2>
        <form onSubmit={handleCreateVault} style={{ display: "grid", gap: 12 }}>
          <input
            value={vaultName}
            onChange={(e) => setVaultName(e.target.value)}
            placeholder="Vault name"
            style={{ width: "100%", padding: 8 }}
          />
          <button type="submit" style={{ padding: "8px 12px" }}>
            Create Vault
          </button>
          {vaultError ? <p style={{ color: "crimson" }}>{vaultError}</p> : null}
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Vaults</h2>
        {vaults.length === 0 ? (
          <p>No vaults yet.</p>
        ) : (
          <ul>
            {vaults.map((vault) => (
              <li key={vault.id}>
                {vault.name} — {vault.id}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

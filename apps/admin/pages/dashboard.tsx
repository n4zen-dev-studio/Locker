import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/router"
import { getAdminEnv } from "@locker/config"
import { createApiClient, getStoredToken, getStoredUser, setStoredToken, setStoredUser } from "../lib/api"

type Vault = { id: string; name: string; ownerUserId: string; createdAt: string }

type User = { id: string; email?: string | null; displayName?: string | null }

type Passkey = { credentialId: string; createdAt: string; lastUsedAt: string | null; transports?: string | null }

export default function DashboardPage() {
  const env = useMemo(() => getAdminEnv(), [])
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [meta, setMeta] = useState<unknown>(null)
  const [vaults, setVaults] = useState<Vault[]>([])
  const [vaultName, setVaultName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [passkeys, setPasskeys] = useState<Passkey[]>([])

  useEffect(() => {
    const storedToken = getStoredToken()
    const storedUser = getStoredUser<User>()
    if (!storedToken) {
      router.replace("/login")
      return
    }
    setToken(storedToken)
    setUser(storedUser)
  }, [router])

  const api = useMemo(() => createApiClient(token), [token])

  async function loadMeta() {
    const res = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}/v1/meta`)
    if (!res.ok) throw new Error(`Meta error: ${res.status}`)
    setMeta(await res.json())
  }

  async function loadVaults() {
    if (!token) return
    const data = await api.request<{ vaults: Vault[] }>("/v1/vaults")
    setVaults(data.vaults || [])
  }

  async function handleCreateVault(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    setError(null)
    try {
      const data = await api.request<{ vault: Vault }>("/v1/vaults", {
        method: "POST",
        body: JSON.stringify({ name: vaultName })
      })
      setVaults((prev) => [data.vault, ...prev])
      setVaultName("")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Create vault failed"
      setError(message)
    }
  }

  async function loadPasskeys() {
    if (!token) return
    const data = await api.request<{ passkeys: Passkey[] }>("/v1/me/passkeys")
    setPasskeys(data.passkeys || [])
  }

  async function deletePasskey(credentialId: string) {
    if (!token) return
    await api.request<{ ok: boolean }>(`/v1/me/passkeys/${credentialId}`, { method: "DELETE" })
    await loadPasskeys()
  }

  function handleLogout() {
    setStoredToken(null)
    setStoredUser(null)
    setToken(null)
    router.replace("/login")
  }

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Locker Admin</h1>
      <p>API Base URL: {env.NEXT_PUBLIC_API_BASE_URL}</p>
      <p>Signed in as: {user?.email ?? user?.id}</p>
      <button onClick={handleLogout} style={{ padding: "6px 10px" }}>
        Logout
      </button>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <button onClick={() => loadMeta().catch((e) => setError(e.message))} style={{ padding: "8px 12px" }}>
          Load Meta
        </button>
        <button onClick={() => loadVaults().catch((e) => setError(e.message))} style={{ padding: "8px 12px" }}>
          List Vaults
        </button>
        <button onClick={() => loadPasskeys().catch((e) => setError(e.message))} style={{ padding: "8px 12px" }}>
          Load Passkeys
        </button>
      </div>

      {error ? <p style={{ color: "crimson", marginTop: 12 }}>{error}</p> : null}

      {meta ? (
        <pre style={{ background: "#f5f5f5", padding: 12, borderRadius: 6, marginTop: 16 }}>
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

      <section style={{ marginTop: 24 }}>
        <h2>Passkeys</h2>
        {passkeys.length === 0 ? (
          <p>No passkeys registered.</p>
        ) : (
          <ul>
            {passkeys.map((pk) => (
              <li key={pk.credentialId} style={{ marginBottom: 8 }}>
                {pk.credentialId}
                <button
                  onClick={() => deletePasskey(pk.credentialId)}
                  style={{ marginLeft: 8 }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

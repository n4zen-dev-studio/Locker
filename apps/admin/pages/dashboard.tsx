import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/router"
import { QRCodeCanvas } from "qrcode.react"
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
  const [linkPayload, setLinkPayload] = useState<string | null>(null)
  const [linkExpiresAt, setLinkExpiresAt] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)

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

  async function handleDeleteVault(vaultId: string) {
    if (!token) return
    const confirmation = window.prompt("Type DELETE to confirm vault deletion")
    if (confirmation !== "DELETE") return
    try {
      await api.request<{ ok: boolean }>(`/v1/vaults/${vaultId}`, { method: "DELETE" })
      await loadVaults()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete vault failed"
      setError(message)
    }
  }

  async function handlePurgeVault(vaultId: string) {
    if (!token) return
    const confirmation = window.confirm("This permanently deletes all data. Continue?")
    if (!confirmation) return
    try {
      await api.request<{ ok: boolean }>(`/v1/vaults/${vaultId}/purge`, { method: "DELETE" })
      await loadVaults()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Purge vault failed"
      setError(message)
    }
  }

  async function loadPasskeys() {
    if (!token) return
    const data = await api.request<{ passkeys: Passkey[] }>("/v1/me/passkeys")
    setPasskeys(data.passkeys || [])
  }

  async function generateLinkCode() {
    if (!token) return
    setLinkError(null)
    try {
      const data = await api.request<{ linkCode: string; expiresAt: string }>("/v1/devices/link-code", {
        method: "POST",
        body: JSON.stringify({}),
      })
      const payload = JSON.stringify({
        t: "locker-link-v1",
        apiBase: env.NEXT_PUBLIC_API_BASE_URL,
        linkCode: data.linkCode,
      })
      setLinkPayload(payload)
      setLinkExpiresAt(data.expiresAt)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate link code"
      setLinkError(message)
    }
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
        <h2>Link Device</h2>
        <p style={{ marginBottom: 8 }}>
          Generate a one-time QR code to link a mobile device.
        </p>
        <button onClick={() => generateLinkCode()} style={{ padding: "8px 12px" }}>
          Generate Link QR
        </button>
        {linkError ? <p style={{ color: "crimson", marginTop: 8 }}>{linkError}</p> : null}
        {linkPayload ? (
          <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
            <QRCodeCanvas value={linkPayload} size={180} />
            <textarea
              readOnly
              value={linkPayload}
              style={{ width: "100%", minHeight: 120, padding: 8 }}
            />
            {linkExpiresAt ? <p>Expires at: {new Date(linkExpiresAt).toLocaleString()}</p> : null}
          </div>
        ) : null}
      </section>

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
              <li key={vault.id} style={{ marginBottom: 8 }}>
                <div>{vault.name} — {vault.id}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <button onClick={() => router.push(`/vaults/${vault.id}/notes`)}>
                    Notes
                  </button>
                  <button onClick={() => handleDeleteVault(vault.id)}>Delete Vault</button>
                  {env.NEXT_PUBLIC_ADMIN_PURGE_ENABLED === "true" ? (
                    <button onClick={() => handlePurgeVault(vault.id)}>Purge Vault</button>
                  ) : null}
                </div>
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

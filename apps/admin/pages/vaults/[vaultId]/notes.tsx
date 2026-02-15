import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/router"
import { getAdminEnv } from "@locker/config"
import { createApiClient, getStoredToken } from "../../../lib/api"

type NotesListResponse = { notes: string[] }

type ViewState = {
  blobId: string
  base64: string
  json: string
  sha256: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = window.atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return hash
}

export default function VaultNotesPage() {
  const router = useRouter()
  const vaultId = typeof router.query.vaultId === "string" ? router.query.vaultId : ""
  const [token, setToken] = useState<string | null>(null)
  const env = useMemo(() => getAdminEnv(), [])
  const api = useMemo(() => createApiClient(token), [token])

  const [notes, setNotes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewState | null>(null)
  const [editMode, setEditMode] = useState<"json" | "base64">("json")
  const [editText, setEditText] = useState("")

  useEffect(() => {
    const stored = getStoredToken()
    if (!stored) {
      router.replace("/login")
      return
    }
    setToken(stored)
  }, [router])

  async function loadNotes() {
    if (!vaultId) return
    setError(null)
    try {
      const data = await api.request<NotesListResponse>(`/v1/vaults/${vaultId}/notes`)
      setNotes(data.notes || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load notes"
      setError(message)
    }
  }

  async function viewBlob(blobId: string) {
    if (!token) return
    setError(null)
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}/v1/vaults/${vaultId}/blobs/${blobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `GET failed: ${res.status}`)
      }
      const buffer = await res.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      const base64 = bytesToBase64(bytes)
      let json = ""
      try {
        json = new TextDecoder().decode(bytes)
      } catch {
        json = ""
      }
      const sha = await sha256Hex(bytes)
      setView({ blobId, base64, json, sha256: sha })
      setEditText(editMode === "json" ? json : base64)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to view blob"
      setError(message)
    }
  }

  async function saveBlob() {
    if (!view) return
    setError(null)
    try {
      const bytes =
        editMode === "json"
          ? new TextEncoder().encode(editText)
          : base64ToBytes(editText.trim())
      const sha = await sha256Hex(bytes)
      const res = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}/v1/vaults/${vaultId}/blobs/${view.blobId}?sha256=${sha}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/octet-stream",
        },
        body: bytes,
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `PUT failed: ${res.status}`)
      }
      setView({ ...view, base64: bytesToBase64(bytes), json: editMode === "json" ? editText : view.json, sha256: sha })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save blob"
      setError(message)
    }
  }

  async function deleteBlob(blobId: string) {
    if (!token) return
    const ok = window.confirm("Delete this note blob? This cannot be undone.")
    if (!ok) return
    setError(null)
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}/v1/vaults/${vaultId}/blobs/${blobId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `DELETE failed: ${res.status}`)
      }
      setNotes((prev) => prev.filter((id) => id !== blobId))
      if (view?.blobId === blobId) setView(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete blob"
      setError(message)
    }
  }

  useEffect(() => {
    void loadNotes()
  }, [vaultId])

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Vault Notes (Encrypted)</h1>
      <p>Vault ID: {vaultId}</p>
      <p style={{ color: "#555" }}>
        These blobs are encrypted. Admin cannot decrypt or view note contents.
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={() => loadNotes()} style={{ padding: "8px 12px" }}>
          Refresh Notes
        </button>
        <button onClick={() => router.push("/dashboard")} style={{ padding: "8px 12px" }}>
          Back to Dashboard
        </button>
      </div>

      {error ? <p style={{ color: "crimson", marginTop: 12 }}>{error}</p> : null}

      <section style={{ marginTop: 24 }}>
        <h2>Note Blobs</h2>
        {notes.length === 0 ? (
          <p>No note blobs in this vault.</p>
        ) : (
          <ul>
            {notes.map((id) => (
              <li key={id} style={{ marginBottom: 8 }}>
                <div>{id}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  <button onClick={() => viewBlob(id)}>View Blob</button>
                  <button onClick={() => deleteBlob(id)}>Delete Blob</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {view ? (
        <section style={{ marginTop: 24 }}>
          <h2>Blob Details</h2>
          <p>Blob ID: {view.blobId}</p>
          <p>sha256: {view.sha256}</p>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => { setEditMode("json"); setEditText(view.json) }}>
              Edit JSON
            </button>
            <button onClick={() => { setEditMode("base64"); setEditText(view.base64) }}>
              Edit Base64
            </button>
          </div>

          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            style={{ width: "100%", minHeight: 220, padding: 8, marginTop: 12 }}
          />

          <button onClick={() => saveBlob()} style={{ padding: "8px 12px", marginTop: 8 }}>
            Save Blob
          </button>
        </section>
      ) : null}
    </main>
  )
}

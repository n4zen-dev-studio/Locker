import { useMemo, useState } from "react"
import { getAdminEnv } from "@locker/config"

type PingState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: unknown }
  | { status: "error"; message: string }

export default function HomePage() {
  const env = useMemo(() => getAdminEnv(), [])
  const [ping, setPing] = useState<PingState>({ status: "idle" })

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

  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Locker Admin</h1>
      <p>API Base URL: {env.NEXT_PUBLIC_API_BASE_URL}</p>
      <button onClick={handlePing} style={{ padding: "8px 12px" }}>
        Ping API
      </button>
      <div style={{ marginTop: 16 }}>
        {ping.status === "idle" && <p>Click "Ping API" to test.</p>}
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
    </main>
  )
}

import { getApiEnv } from "@locker/config"
import type Database from "better-sqlite3"

const MAX_BATCH_SIZE = 100

type PushTokenRow = { token: string }

type PushEvent = {
  provider: string
  status: "mock" | "sent" | "failed"
  payload: unknown
  response?: unknown
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function recordPushEvent(db: Database.Database, event: PushEvent): void {
  const now = new Date().toISOString()
  db.prepare(
    "INSERT INTO push_events (provider, status, payload, response, createdAt) VALUES (?, ?, ?, ?, ?)"
  ).run(
    event.provider,
    event.status,
    JSON.stringify(event.payload ?? null),
    JSON.stringify(event.response ?? null),
    now,
  )
}

export async function sendVaultChangedPush(
  db: Database.Database,
  input: { vaultId: string },
): Promise<void> {
  const env = getApiEnv()
  if (!env.PUSH_ENABLED) return

  const tokens = db
    .prepare(
      "SELECT token FROM push_tokens WHERE userId IN (SELECT ownerUserId FROM vaults WHERE id = ?)"
    )
    .all(input.vaultId) as PushTokenRow[]

  if (!tokens.length) return

  const messages = tokens.map((row) => ({
    to: row.token,
    sound: "default",
    data: { type: "vault_changed", vaultId: input.vaultId },
  }))

  if (env.PUSH_PROVIDER === "mock") {
    recordPushEvent(db, {
      provider: "mock",
      status: "mock",
      payload: { vaultId: input.vaultId, count: messages.length, messages },
    })
    return
  }

  const batches = chunk(messages, MAX_BATCH_SIZE)
  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index]
    try {
      const res = await fetch(env.EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch),
      })

      const text = await res.text()
      let response: unknown = text
      try {
        response = text ? JSON.parse(text) : text
      } catch {
        response = text
      }

      if (!res.ok) {
        recordPushEvent(db, {
          provider: "expo",
          status: "failed",
          payload: { vaultId: input.vaultId, messages: batch },
          response,
        })
        continue
      }

      recordPushEvent(db, {
        provider: "expo",
        status: "sent",
        payload: { vaultId: input.vaultId, count: batch.length },
        response,
      })
    } catch (err) {
      recordPushEvent(db, {
        provider: "expo",
        status: "failed",
        payload: { vaultId: input.vaultId, messages: batch },
        response: { error: err instanceof Error ? err.message : String(err) },
      })
    }

    if (index < batches.length - 1) {
      await sleep(200)
    }
  }
}

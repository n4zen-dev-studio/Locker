import type Database from "better-sqlite3"

export type AuditEventInput = {
  userId: string
  vaultId?: string | null
  type: string
  meta?: Record<string, unknown> | null
}

export function recordAuditEvent(db: Database.Database, event: AuditEventInput): void {
  const now = new Date().toISOString()
  const meta = event.meta ? JSON.stringify(event.meta) : null
  db.prepare(
    "INSERT INTO audit_events (userId, vaultId, type, meta, createdAt) VALUES (?, ?, ?, ?, ?)"
  ).run(event.userId, event.vaultId ?? null, event.type, meta, now)
}

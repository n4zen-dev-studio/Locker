import { load, save } from "@/utils/storage"

const AUDIT_LOG_KEY = "locker:security:audit-log:v1"
const MAX_AUDIT_EVENTS = 200

export type SecurityEventType =
  | "unlock_success"
  | "unlock_failure"
  | "passkey_enabled"
  | "recovery_configured"
  | "recovery_removed"
  | "recovery_recovered"
  | "auto_lock"
  | "step_up_success"
  | "step_up_failure"
  | "secure_delete"
  | "panic_action"
  | "decoy_vault_open"
  | "decoy_vault_close"
  | "sync_target_changed"
  | "trust_cleared"

export type SecurityAuditEvent = {
  id: string
  type: SecurityEventType
  createdAt: string
  message: string
  severity: "info" | "warning" | "critical"
  meta?: Record<string, string | number | boolean | null>
}

export function listSecurityAuditEvents(): SecurityAuditEvent[] {
  return load<SecurityAuditEvent[]>(AUDIT_LOG_KEY) ?? []
}

export function recordSecurityEvent(input: Omit<SecurityAuditEvent, "id" | "createdAt">): SecurityAuditEvent {
  const event: SecurityAuditEvent = {
    id: createId(),
    createdAt: new Date().toISOString(),
    ...input,
  }
  const existing = listSecurityAuditEvents()
  save(AUDIT_LOG_KEY, [event, ...existing].slice(0, MAX_AUDIT_EVENTS))
  return event
}

export function recentSecurityAuditEvents(limit = 20): SecurityAuditEvent[] {
  return listSecurityAuditEvents().slice(0, limit)
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

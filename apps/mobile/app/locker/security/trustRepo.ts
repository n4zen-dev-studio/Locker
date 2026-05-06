import { load, save } from "@/utils/storage"

const TRUST_META_KEY = "locker:security:trust-meta:v1"
const ELEVATED_WINDOW_MS = 5 * 60 * 1000

export type TrustState = "locked" | "standard" | "elevated"

type TrustMeta = {
  lastUnlockAt: string | null
}

type RuntimeTrust = {
  state: TrustState
  unlockedAt: string | null
  elevatedUntil: number | null
}

const runtime: RuntimeTrust = {
  state: "locked",
  unlockedAt: null,
  elevatedUntil: null,
}

const listeners = new Set<() => void>()

export function subscribeTrust(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function activateStandardSession(at = new Date()): void {
  runtime.state = "standard"
  runtime.unlockedAt = at.toISOString()
  runtime.elevatedUntil = null
  save(TRUST_META_KEY, { lastUnlockAt: runtime.unlockedAt } satisfies TrustMeta)
  emit()
}

export function elevateSession(now = Date.now()): void {
  runtime.state = "elevated"
  runtime.elevatedUntil = now + ELEVATED_WINDOW_MS
  emit()
}

export function clearSessionTrust(): void {
  runtime.state = "locked"
  runtime.unlockedAt = null
  runtime.elevatedUntil = null
  emit()
}

export function getTrustState(now = Date.now()): TrustState {
  if (runtime.state === "elevated" && runtime.elevatedUntil && runtime.elevatedUntil <= now) {
    runtime.state = "standard"
    runtime.elevatedUntil = null
    emit()
  }
  return runtime.state
}

export function getTrustSnapshot(now = Date.now()): {
  state: TrustState
  unlockedAt: string | null
  lastUnlockAt: string | null
  elevatedUntil: string | null
} {
  const state = getTrustState(now)
  const meta = load<TrustMeta>(TRUST_META_KEY)
  return {
    state,
    unlockedAt: runtime.unlockedAt,
    lastUnlockAt: meta?.lastUnlockAt ?? null,
    elevatedUntil: runtime.elevatedUntil ? new Date(runtime.elevatedUntil).toISOString() : null,
  }
}

export function hasElevatedSession(now = Date.now()): boolean {
  return getTrustState(now) === "elevated"
}

function emit(): void {
  listeners.forEach((listener) => listener())
}

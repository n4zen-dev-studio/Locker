import { Platform } from "react-native"

import { randomBytes } from "@/locker/crypto/random"
import { bytesToBase64 } from "@/locker/crypto/encoding"
import { load, save } from "@/utils/storage"

const BOOTSTRAP_KEY = "locker:bootstrap:v1"

export type BootstrapState = {
  requested: boolean
  completedAt?: string
  userEmail: string
  deviceId: string
  deviceName: string
}

function randomId(prefix: string): string {
  return `${prefix}-${bytesToBase64(randomBytes(9)).replace(/[+/=]/g, "").toLowerCase()}`
}

function defaultDeviceName(): string {
  return Platform.OS === "ios" ? "Locker iPhone" : Platform.OS === "android" ? "Locker Android" : "Locker Device"
}

export function getBootstrapState(): BootstrapState | null {
  return load<BootstrapState>(BOOTSTRAP_KEY)
}

export function ensureBootstrapState(): BootstrapState {
  const existing = getBootstrapState()
  if (existing) return existing
  const state: BootstrapState = {
    requested: false,
    userEmail: `${randomId("locker")}@local.locker`,
    deviceId: randomId("device"),
    deviceName: defaultDeviceName(),
  }
  save(BOOTSTRAP_KEY, state)
  return state
}

export function markBootstrapRequested(): BootstrapState {
  const state = { ...ensureBootstrapState(), requested: true }
  save(BOOTSTRAP_KEY, state)
  return state
}

export function markBootstrapCompleted(): BootstrapState {
  const state = { ...ensureBootstrapState(), requested: true, completedAt: new Date().toISOString() }
  save(BOOTSTRAP_KEY, state)
  return state
}

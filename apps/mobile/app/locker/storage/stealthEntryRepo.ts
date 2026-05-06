import { load, remove, save } from "@/utils/storage"
import { sha256Hex } from "@/locker/crypto/sha"
import { utf8ToBytes } from "@/locker/crypto/encoding"

const REAL_ENTRY_CODE_HASH_KEY = "locker:stealth:real-entry-code-hash:v1"
const DECOY_ENTRY_CODE_HASH_KEY = "locker:stealth:decoy-entry-code-hash:v1"
export const DEFAULT_DECOY_ENTRY_CODE = "1234"
const ENTRY_CODE_PATTERN = /^\d{4,8}$/

const DEFAULT_DECOY_ENTRY_CODE_HASH = hashEntryCode(DEFAULT_DECOY_ENTRY_CODE)

export function isValidStealthEntryCode(code: string): boolean {
  return ENTRY_CODE_PATTERN.test(code)
}

export function hasRealVaultEntryCode(): boolean {
  return typeof load<string>(REAL_ENTRY_CODE_HASH_KEY) === "string"
}

export function setRealVaultEntryCode(code: string): void {
  if (!isValidStealthEntryCode(code)) {
    throw new Error("Vault entry code must be 4 to 8 digits")
  }
  save(REAL_ENTRY_CODE_HASH_KEY, hashEntryCode(code))
}

export function clearRealVaultEntryCode(): void {
  remove(REAL_ENTRY_CODE_HASH_KEY)
}

export function setDecoyVaultEntryCode(code: string): void {
  if (!isValidStealthEntryCode(code)) {
    throw new Error("Decoy entry code must be 4 to 8 digits")
  }
  save(DECOY_ENTRY_CODE_HASH_KEY, hashEntryCode(code))
}

export function hasCustomDecoyVaultEntryCode(): boolean {
  return typeof load<string>(DECOY_ENTRY_CODE_HASH_KEY) === "string"
}

export function resetDecoyVaultEntryCode(): void {
  remove(DECOY_ENTRY_CODE_HASH_KEY)
}

export function matchesRealVaultEntryCode(input: string): boolean {
  const storedHash = load<string>(REAL_ENTRY_CODE_HASH_KEY)
  if (!storedHash || !isValidStealthEntryCode(input)) return false
  return storedHash === hashEntryCode(input)
}

export function matchesDecoyVaultEntryCode(input: string): boolean {
  if (!isValidStealthEntryCode(input)) return false
  const storedHash = load<string>(DECOY_ENTRY_CODE_HASH_KEY) ?? DEFAULT_DECOY_ENTRY_CODE_HASH
  return storedHash === hashEntryCode(input)
}

function hashEntryCode(code: string): string {
  return sha256Hex(utf8ToBytes(code))
}

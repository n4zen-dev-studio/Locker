import { fetchJson, isNotFound } from "@/locker/net/apiClient"
import { getToken } from "@/locker/auth/tokenStore"
import { randomBytes } from "@/locker/crypto/random"
import { deriveKek } from "@/locker/crypto/kdf"
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from "@/locker/crypto/encoding"
import { decryptV1, encryptV1, EnvelopeV1 } from "@/locker/crypto/aead"
import { ensureUserKeypair, decryptPrivateKeyWithVMK, hasUserPrivateKey, storeUserKeypairFromPrivate } from "@/locker/keys/userKeyRepo"
import { ensureUserKeypairUploaded, fetchAndInstallVaultKeyEnvelope } from "@/locker/keys/userKeyApi"

type BackupResponse = {
  alg: string
  kdf: {
    alg: "SCRYPT"
    N: number
    r: number
    p: number
    dkLen: number
    saltB64: string
  }
  wrappedPrivateKeyB64: string
  updatedAt: string
}

export async function hasKeyBackup(): Promise<boolean> {
  const token = await getToken()
  if (!token) return false
  try {
    await fetchJson<BackupResponse>("/v1/me/key-backup", {}, { token })
    return true
  } catch (err) {
    if (isNotFound(err)) return false
    throw err
  }
}

export async function createOrUpdateKeyBackup(recoveryPassphrase: string): Promise<void> {
  const token = await getToken()
  if (!token) throw new Error("Link device first")
  if (!recoveryPassphrase || recoveryPassphrase.trim().length < 8) {
    throw new Error("Recovery passphrase must be at least 8 characters")
  }

  if (!hasUserPrivateKey()) {
    ensureUserKeypair()
  }

  const privateKey = decryptPrivateKeyWithVMK()
  const salt = randomBytes(16)
  const kdfParams = {
    alg: "SCRYPT" as const,
    N: 32768,
    r: 8,
    p: 1,
    dkLen: 32,
    salt,
  }
  const kek = deriveKek(recoveryPassphrase, kdfParams)
  const wrapped = encryptV1(kek, privateKey)
  const wrappedPrivateKeyB64 = bytesToBase64(utf8ToBytes(JSON.stringify(wrapped)))
  const kdf = {
    alg: kdfParams.alg,
    N: kdfParams.N,
    r: kdfParams.r,
    p: kdfParams.p,
    dkLen: kdfParams.dkLen,
    saltB64: bytesToBase64(kdfParams.salt),
  }

  await fetchJson<{ ok: boolean }>(
    "/v1/me/key-backup",
    {
      method: "POST",
      body: JSON.stringify({
        alg: "X25519",
        kdf,
        wrappedPrivateKeyB64,
      }),
    },
    { token },
  )
}

export async function deleteKeyBackup(): Promise<void> {
  const token = await getToken()
  if (!token) throw new Error("Link device first")
  await fetchJson<{ ok: boolean }>("/v1/me/key-backup", { method: "DELETE" }, { token })
}

export async function recoverUserKeypair(recoveryPassphrase: string): Promise<void> {
  const token = await getToken()
  if (!token) throw new Error("Link device first")
  if (!recoveryPassphrase || recoveryPassphrase.trim().length < 8) {
    throw new Error("Recovery passphrase must be at least 8 characters")
  }

  let backup: BackupResponse
  try {
    backup = await fetchJson<BackupResponse>("/v1/me/key-backup", {}, { token })
  } catch (err) {
    if (isNotFound(err)) {
      throw new Error("No recovery backup configured. Use manual pairing.")
    }
    throw err
  }

  const salt = base64ToBytes(backup.kdf.saltB64)
  const kek = deriveKek(recoveryPassphrase, {
    alg: "SCRYPT",
    N: backup.kdf.N,
    r: backup.kdf.r,
    p: backup.kdf.p,
    dkLen: backup.kdf.dkLen,
    salt,
  })

  let wrapped: EnvelopeV1
  try {
    const wrappedBytes = base64ToBytes(backup.wrappedPrivateKeyB64)
    wrapped = JSON.parse(bytesToUtf8(wrappedBytes)) as EnvelopeV1
  } catch {
    throw new Error("Invalid recovery backup data")
  }

  let privateKey: Uint8Array
  try {
    privateKey = decryptV1(kek, wrapped)
  } catch {
    throw new Error("Wrong recovery passphrase")
  }

  storeUserKeypairFromPrivate(privateKey)
  await ensureUserKeypairUploaded()

  await recoverVaultKeys()
}

async function recoverVaultKeys(): Promise<void> {
  const token = await getToken()
  if (!token) return
  const data = await fetchJson<{ vaults: Array<{ id: string }> }>("/v1/vaults", {}, { token })
  for (const vault of data.vaults ?? []) {
    try {
      await fetchAndInstallVaultKeyEnvelope(vault.id)
    } catch {
      // best effort; do not fail recovery on envelope issues
    }
  }
}

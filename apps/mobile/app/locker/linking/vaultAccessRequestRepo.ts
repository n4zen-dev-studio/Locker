import nacl from "tweetnacl"

import { base64ToBytes, bytesToBase64 } from "@/locker/crypto/encoding"
import { randomBytes } from "@/locker/crypto/random"
import { load, remove, save } from "@/utils/storage"

const STORAGE_KEY = "locker:vault-access-requests:v1"

type StoredRequest = {
  requestId: string
  vaultId: string
  publicKeyB64: string
  privateKeyB64: string
  createdAt: string
}

type RequestState = Record<string, StoredRequest>

function readState(): RequestState {
  return load<RequestState>(STORAGE_KEY) ?? {}
}

function writeState(state: RequestState): void {
  if (Object.keys(state).length === 0) {
    remove(STORAGE_KEY)
    return
  }
  save(STORAGE_KEY, state)
}

export function createVaultAccessRequestKeypair(vaultId: string): {
  requesterPublicKey: string
  privateKey: Uint8Array
} {
  // Use the app's RN-compatible secure random source instead of nacl's ambient PRNG lookup.
  const privateKey = randomBytes(nacl.box.secretKeyLength)
  const kp = nacl.box.keyPair.fromSecretKey(privateKey)
  const publicKeyB64 = bytesToBase64(kp.publicKey)
  return {
    requesterPublicKey: publicKeyB64,
    privateKey,
  }
}

export function storeVaultAccessRequestKeypair(input: {
  requestId: string
  vaultId: string
  requesterPublicKey: string
  privateKey: Uint8Array
}): void {
  const state = readState()
  state[input.requestId] = {
    requestId: input.requestId,
    vaultId: input.vaultId,
    publicKeyB64: input.requesterPublicKey,
    privateKeyB64: bytesToBase64(input.privateKey),
    createdAt: new Date().toISOString(),
  }
  writeState(state)
}

export function getVaultAccessRequestPrivateKey(requestId: string): Uint8Array | null {
  const record = readState()[requestId]
  if (!record) return null
  return base64ToBytes(record.privateKeyB64)
}

export function clearVaultAccessRequestKeypair(requestId: string): void {
  const state = readState()
  if (!state[requestId]) return
  delete state[requestId]
  writeState(state)
}

export function listStoredVaultAccessRequests(): StoredRequest[] {
  return Object.values(readState())
}

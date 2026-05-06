import { fetchJson, isNotFound } from "@/locker/net/apiClient"
import { getToken } from "@/locker/auth/tokenStore"
import { base64ToBytes } from "@/locker/crypto/encoding"
import { ensureUserKeypair, decryptPrivateKeyWithVMK } from "./userKeyRepo"
import {
  createSealedBoxEnvelope,
  decodeEnvelopeFromBase64,
  encodeEnvelopeToBase64,
  openSealedBoxEnvelope,
} from "@/locker/crypto/sealedBox"
import { setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"

export async function ensureUserKeypairUploaded(): Promise<void> {
  const token = await getToken()
  if (!token) return
  const { publicKeyB64 } = ensureUserKeypair()
  await fetchJson<{ ok: boolean }>(
    "/v1/me/keys",
    {
      method: "POST",
      body: JSON.stringify({ alg: "X25519", publicKey: publicKeyB64 }),
    },
    { token },
  )
}

export async function fetchAndInstallVaultKeyEnvelope(vaultId: string): Promise<Uint8Array | null> {
  const token = await getToken()
  if (!token) throw new Error("Link device first")

  try {
    const data = await fetchJson<{ envelope: { envelopeB64: string } }>(
      `/v1/vaults/${vaultId}/key-envelopes/me`,
      {},
      { token },
    )
    const envelope = decodeEnvelopeFromBase64(data.envelope.envelopeB64)
    const privateKey = decryptPrivateKeyWithVMK()
    const rvk = openSealedBoxEnvelope(privateKey, envelope)
    if (rvk.length !== 32) throw new Error("Invalid RVK length")
    await setRemoteVaultKey(vaultId, rvk)
    return rvk
  } catch (err) {
    if (isNotFound(err)) return null
    throw err
  }
}

export function buildVaultKeyEnvelope(recipientPublicKeyB64: string, rvk: Uint8Array): string {
  const recipientPublicKey = base64ToBytes(recipientPublicKeyB64)
  const envelope = createSealedBoxEnvelope(recipientPublicKey, rvk)
  return encodeEnvelopeToBase64(envelope)
}

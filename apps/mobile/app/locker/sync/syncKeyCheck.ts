import { encryptV1 } from "@/locker/crypto/aead"
import { utf8ToBytes } from "@/locker/crypto/encoding"
import { sha256Hex } from "@/locker/crypto/sha"
import { decryptBlobBytesToJson } from "@/locker/sync/remoteCodec"
import { fetchRaw } from "@/locker/net/apiClient"
import { getToken } from "@/locker/auth/tokenStore"

export const SYNC_KEY_CHECK_BLOB_ID = "sync-key-check-v1"

export async function putAndVerifySyncKeyCheck(
  vaultId: string,
  rvk: Uint8Array,
  payloadExtra: Record<string, any> = {},
): Promise<void> {
  const token = await getToken()
  if (!token) throw new Error("Link device first")

  const payload = {
    v: 1,
    type: "sync-key-check",
    vaultId,
    createdAt: new Date().toISOString(),
    ...payloadExtra,
  }

  const envelope = encryptV1(rvk, utf8ToBytes(JSON.stringify(payload)))
  const bodyBytes = utf8ToBytes(JSON.stringify(envelope))
  const sha256 = sha256Hex(bodyBytes)

  // PUT (octet-stream, authenticated)
  await fetchRaw(
    `/v1/vaults/${vaultId}/blobs/${SYNC_KEY_CHECK_BLOB_ID}?sha256=${sha256}`,
    {
      method: "PUT",
      headers: { "content-type": "application/octet-stream" },
      body: bodyBytes as any,
    },
    { token },
  )

  // Verify immediately
  const verifyBytes = await fetchRaw(
    `/v1/vaults/${vaultId}/blobs/${SYNC_KEY_CHECK_BLOB_ID}`,
    {},
    { token },
  )

  const verifyPayload = decryptBlobBytesToJson<any>(rvk, verifyBytes)
  if (verifyPayload?.type !== "sync-key-check" || verifyPayload?.vaultId !== vaultId) {
    throw new Error("Sync key check verification failed after upload.")
  }
}

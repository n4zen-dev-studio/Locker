import { Platform } from "react-native"

import { getToken, setToken } from "@/locker/auth/tokenStore"
import { ensureBootstrapState } from "@/locker/bootstrap/bootstrapRepo"
import { fetchJson, getApiBaseUrl } from "@/locker/net/apiClient"
import { completeVaultSelectionFlow } from "@/locker/storage/onboardingRepo"
import { AccountState, setAccount } from "@/locker/storage/accountRepo"
import { setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { setRemoteVaultId, setVaultEnabledOnDevice } from "@/locker/storage/remoteVaultRepo"
import { setServerUrl } from "@/locker/storage/serverConfigRepo"
import type { RecoveryEnvelopePayload, RecoveryEnvelopeRecord } from "./recoveryKey"

type RecoveryStatusResponse = {
  configured: boolean
  envelope?: {
    vaultId: string
    recoveryId: string
    version: number
    keyVersion: string
    alg: "XCHACHA20-POLY1305"
    kdf: RecoveryEnvelopeRecord["kdf"]
    createdAt: string
    rotatedAt: string
  }
}

type PublicEnvelopeResponse = {
  envelope: RecoveryEnvelopeRecord
}

type RecoveryRedeemResponse = {
  token: string
  user: { id: string; email?: string; createdAt: string }
  device: { id: string; userId: string; name: string; platform: string; createdAt: string; lastSeenAt?: string }
  vault: { id: string; name: string }
}

export async function getRecoveryEnvelopeStatus(vaultId: string): Promise<RecoveryStatusResponse> {
  const token = await getToken()
  if (!token) throw new Error("Link device first")
  return fetchJson<RecoveryStatusResponse>(`/v1/vaults/${vaultId}/recovery-envelope`, {}, { token })
}

export async function upsertRecoveryEnvelope(vaultId: string, envelope: RecoveryEnvelopePayload): Promise<void> {
  const token = await getToken()
  if (!token) throw new Error("Link device first")
  await fetchJson<{ ok: boolean }>(
    `/v1/vaults/${vaultId}/recovery-envelope`,
    {
      method: "POST",
      body: JSON.stringify(envelope),
    },
    { token },
  )
}

export async function fetchPublicRecoveryEnvelope(recoveryId: string): Promise<RecoveryEnvelopeRecord> {
  const response = await fetchJson<PublicEnvelopeResponse>(`/v1/recovery-envelopes/${recoveryId}`, {}, { auth: "none" })
  return response.envelope
}

export async function redeemRecoveryEnvelope(args: {
  proofB64: string
  vaultKey: Uint8Array
  envelope: RecoveryEnvelopeRecord
  deviceName: string
}): Promise<void> {
  const bootstrap = ensureBootstrapState()
  const apiBase = getApiBaseUrl()
  const response = await fetchJson<RecoveryRedeemResponse>(
    `/v1/recovery-envelopes/${args.envelope.recoveryId}/redeem`,
    {
      method: "POST",
      body: JSON.stringify({
        proofB64: args.proofB64,
        deviceId: bootstrap.deviceId,
        deviceName: args.deviceName.trim() || "Locker Mobile",
        platform: Platform.OS === "ios" ? "ios" : "android",
      }),
    },
    { auth: "none", baseUrl: apiBase },
  )

  await setToken(response.token)
  setServerUrl(apiBase)

  const account: AccountState = {
    user: response.user,
    device: response.device,
    apiBase,
    linkedAt: new Date().toISOString(),
  }
  setAccount(account)

  await setRemoteVaultKey(response.vault.id, args.vaultKey)
  setVaultEnabledOnDevice(response.vault.id, true, { name: response.vault.name })
  setRemoteVaultId(response.vault.id, response.vault.name)
  completeVaultSelectionFlow()
}

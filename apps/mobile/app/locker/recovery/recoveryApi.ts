import { Platform } from "react-native"

import { getToken, setToken } from "@/locker/auth/tokenStore"
import { ensureBootstrapState } from "@/locker/bootstrap/bootstrapRepo"
import { fetchJson, getApiBaseUrl } from "@/locker/net/apiClient"
import { completeVaultSelectionFlow } from "@/locker/storage/onboardingRepo"
import { AccountState, setAccount } from "@/locker/storage/accountRepo"
import { setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { setRemoteVaultId, setVaultEnabledOnDevice } from "@/locker/storage/remoteVaultRepo"
import { setServerUrl } from "@/locker/storage/serverConfigRepo"
import { requestSync } from "@/locker/sync/syncCoordinator"
import type { RecoveryArtifactPayload, RecoveryArtifactRecord } from "./recoveryKey"

type RecoveryStatusResponse = {
  configured: boolean
  envelope?: {
    vaultId: string
    recoveryId: string
    version: number
    keyVersion: string
    alg: RecoveryArtifactRecord["alg"]
    kdf: RecoveryArtifactRecord["kdf"]
    createdAt: string
    rotatedAt: string
  }
}

type PublicArtifactResponse = {
  artifact: RecoveryArtifactRecord
}

type RecoveryRedeemResponse = {
  token: string
  user: { id: string; email?: string; createdAt: string }
  device: { id: string; userId: string; name: string; platform: string; createdAt: string; lastSeenAt?: string }
  recoveredVault: { id: string; name: string }
  linkedVaults: Array<{ id: string; name: string }>
  personalVaultMissing?: boolean
  legacyLimited?: boolean
}

type RecoveryVaultRedeemResponse = {
  vault: { id: string; name: string }
  enabledAt: string
  legacyLimited?: boolean
}

export async function getRecoveryEnvelopeStatus(vaultId: string): Promise<RecoveryStatusResponse> {
  const token = await getToken()
  if (!token) throw new Error("Link device first")
  return fetchJson<RecoveryStatusResponse>(`/v1/vaults/${vaultId}/recovery-envelope`, {}, { token })
}

export async function upsertRecoveryEnvelope(vaultId: string, envelope: RecoveryArtifactPayload): Promise<void> {
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

export async function fetchPublicRecoveryEnvelope(recoveryId: string): Promise<RecoveryArtifactRecord> {
  const response = await fetchJson<PublicArtifactResponse>(`/v1/recovery-envelopes/${recoveryId}`, {}, { auth: "none" })
  return response.artifact
}

export async function redeemRecoveryEnvelope(args: {
  proofB64: string
  recoveredVaults: Array<{ vaultId: string; vaultKey: Uint8Array; vaultName?: string | null }>
  artifact: RecoveryArtifactRecord
  deviceName: string
}): Promise<{ personalVaultMissing: boolean; legacyLimited: boolean }> {
  const bootstrap = ensureBootstrapState()
  const apiBase = getApiBaseUrl()
  const response = await fetchJson<RecoveryRedeemResponse>(
    `/v1/recovery-envelopes/${args.artifact.recoveryId}/redeem`,
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

  for (const vault of response.linkedVaults) {
    setVaultEnabledOnDevice(vault.id, true, { name: vault.name })
  }
  await installRecoveredVaultKeys(args.recoveredVaults, response.linkedVaults)
  setRemoteVaultId(response.recoveredVault.id, response.recoveredVault.name)
  completeVaultSelectionFlow()
  await requestSyncForVaults(response.linkedVaults.map((vault) => vault.id))
  return {
    personalVaultMissing: response.personalVaultMissing === true,
    legacyLimited: response.legacyLimited === true,
  }
}

export async function redeemRecoveryVaultAccess(args: {
  proofB64: string
  recoveredVault: { vaultId: string; vaultKey: Uint8Array; vaultName?: string | null }
  artifact: RecoveryArtifactRecord
}): Promise<{ vaultId: string; vaultName: string; legacyLimited: boolean }> {
  const token = await getToken()
  if (!token) throw new Error("Link device first")

  const response = await fetchJson<RecoveryVaultRedeemResponse>(
    `/v1/recovery-envelopes/${args.artifact.recoveryId}/redeem-vault`,
    {
      method: "POST",
      body: JSON.stringify({
        proofB64: args.proofB64,
      }),
    },
    { token },
  )

  await setRemoteVaultKey(response.vault.id, args.recoveredVault.vaultKey)
  setVaultEnabledOnDevice(response.vault.id, true, {
    name: response.vault.name,
    enabledAt: response.enabledAt,
  })
  setRemoteVaultId(response.vault.id, response.vault.name)
  void requestSync("vault_enabled", response.vault.id)
  return {
    vaultId: response.vault.id,
    vaultName: response.vault.name,
    legacyLimited: response.legacyLimited === true,
  }
}

async function installRecoveredVaultKeys(
  recoveredVaults: Array<{ vaultId: string; vaultKey: Uint8Array; vaultName?: string | null }>,
  linkedVaults: Array<{ id: string; name: string }>,
): Promise<void> {
  const recoveredById = new Map(recoveredVaults.map((vault) => [vault.vaultId, vault]))
  await Promise.all(
    linkedVaults.map(async (vault) => {
      const recovered = recoveredById.get(vault.id)
      if (!recovered) return
      await setRemoteVaultKey(vault.id, recovered.vaultKey)
    }),
  )
}

async function requestSyncForVaults(vaultIds: string[]): Promise<void> {
  await Promise.all([...new Set(vaultIds)].map((vaultId) => requestSync("vault_enabled", vaultId)))
}

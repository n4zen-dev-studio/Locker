import { Platform } from "react-native"

import { fetchJson } from "@/locker/net/apiClient"
import { getToken, setToken } from "@/locker/auth/tokenStore"
import { getAccount, setAccount } from "@/locker/storage/accountRepo"
import { ensureBootstrapState, markBootstrapCompleted, markBootstrapRequested } from "./bootstrapRepo"
import { DeviceDTO, UserDTO, VaultDTO } from "@locker/types"
import { ensureUserKeypairUploaded, buildVaultKeyEnvelope } from "@/locker/keys/userKeyApi"
import { randomBytes } from "@/locker/crypto/random"
import { getRemoteVaultKey, setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { putAndVerifySyncKeyCheck } from "@/locker/sync/syncKeyCheck"
import { getApiBaseUrl } from "@/locker/net/apiClient"
import { getUserKeyMetadata } from "@/locker/keys/userKeyRepo"
import { setRemoteVaultCatalog, setRemoteVaultId, setVaultEnabledOnDevice } from "@/locker/storage/remoteVaultRepo"
import { requestSync } from "@/locker/sync/syncCoordinator"

const PERSONAL_VAULT_NAME = "Personal"

let inFlight: Promise<void> | null = null

export async function ensureNewUserBootstrap(): Promise<void> {
  if (inFlight) return inFlight
  inFlight = runBootstrap().finally(() => {
    inFlight = null
  })
  return inFlight
}

async function runBootstrap(): Promise<void> {
  const bootstrap = markBootstrapRequested()

  let account = getAccount()
  const token = await getToken()
  if (!account || !token) {
    const login = await fetchJson<{ token: string; user: UserDTO }>(
      "/v1/auth/dev-login",
      {
        method: "POST",
        body: JSON.stringify({ email: bootstrap.userEmail }),
      },
      { auth: "none" },
    )
    await setToken(login.token)
    const registered = await fetchJson<{ device: DeviceDTO }>("/v1/devices/register", {
      method: "POST",
      body: JSON.stringify({
        deviceId: bootstrap.deviceId,
        name: bootstrap.deviceName,
        platform: Platform.OS === "android" ? "android" : "ios",
      }),
    })
    account = {
      user: login.user,
      device: registered.device,
      apiBase: getApiBaseUrl(),
      linkedAt: new Date().toISOString(),
    }
    setAccount(account)
  }

  const registered = await fetchJson<{ device: DeviceDTO }>("/v1/devices/register", {
    method: "POST",
    body: JSON.stringify({
      deviceId: bootstrap.deviceId,
      name: bootstrap.deviceName,
      platform: Platform.OS === "android" ? "android" : "ios",
    }),
  })
  account = {
    ...(account as NonNullable<typeof account>),
    device: registered.device,
  }
  setAccount(account)

  await ensureUserKeypairUploaded()

  let vaults = (await fetchJson<{ vaults: VaultDTO[] }>("/v1/vaults")).vaults ?? []
  let personal = vaults.find((vault) => vault.name === PERSONAL_VAULT_NAME) ?? null
  if (!personal) {
    const created = await fetchJson<{ vault: VaultDTO }>("/v1/vaults", {
      method: "POST",
      body: JSON.stringify({ name: PERSONAL_VAULT_NAME }),
    })
    personal = created.vault
    vaults = [...vaults, created.vault]
  }

  await fetchJson(`/v1/devices/${account.device.id}/vaults/${personal.id}`, { method: "PUT" })

  let rvk = await getRemoteVaultKey(personal.id)
  if (!rvk) {
    rvk = randomBytes(32)
    await setRemoteVaultKey(personal.id, rvk)
    await putAndVerifySyncKeyCheck(personal.id, rvk, { bootstrap: true })
  }

  const keyMeta = getUserKeyMetadata()
  if (!keyMeta) throw new Error("Missing user key metadata")
  const envelopeB64 = buildVaultKeyEnvelope(keyMeta.publicKeyB64, rvk)
  await fetchJson(`/v1/vaults/${personal.id}/key-envelopes`, {
    method: "POST",
    body: JSON.stringify({
      userId: account.user.id,
      alg: "X25519",
      envelopeB64,
    }),
  })

  setRemoteVaultCatalog(
    vaults.map((vault) =>
      vault.id === personal!.id
        ? { ...vault, enabledOnDevice: true, enabledAt: new Date().toISOString() }
        : vault,
    ),
  )
  setVaultEnabledOnDevice(personal.id, true, { name: personal.name })
  setRemoteVaultId(personal.id, personal.name)
  void requestSync("vault_enabled", personal.id)
  markBootstrapCompleted()
}

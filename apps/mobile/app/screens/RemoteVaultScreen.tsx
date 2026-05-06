import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import QRCode from "qrcode"
import { SvgXml } from "react-native-svg"

import { DeviceDTO, VaultAccessRequestDTO, VaultDTO } from "@locker/types"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { getAccount } from "@/locker/storage/accountRepo"
import { fetchJson } from "@/locker/net/apiClient"
import { getRemoteVaultKey, setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import {
  getRemoteVaultId,
  listRemoteVaults,
  renameRemoteVault,
  setRemoteVaultCatalog,
  setRemoteVaultId,
  setVaultEnabledOnDevice,
} from "@/locker/storage/remoteVaultRepo"
import { provisionVaultForCurrentUser } from "@/locker/keys/userKeyApi"
import { buildVaultKeyEnvelope } from "@/locker/keys/userKeyApi"
import { requestSync } from "@/locker/sync/syncCoordinator"
import { getSyncStatus } from "@/locker/sync/syncEngine"
import { vaultSession } from "@/locker/session"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { generatePairingCode, buildWrappedVaultKeyPayload } from "@/locker/pairing/pairingCode"
import { createVaultAccessRequestKeypair, clearVaultAccessRequestKeypair, getVaultAccessRequestPrivateKey, storeVaultAccessRequestKeypair } from "@/locker/linking/vaultAccessRequestRepo"
import { decodeEnvelopeFromBase64, openSealedBoxEnvelope } from "@/locker/crypto/sealedBox"
import { encodeVaultAccessQrPayload } from "@/locker/linking/qrPayload"
import { removeVaultFromCurrentDevice, forgetDeletedVaultLocally } from "@/locker/vaults/deviceVaultCleanup"

const PERSONAL_VAULT_NAME = "Personal"

type GeneratedVaultAccess = {
  vaultId: string
  code: string
  expiresAt: string
  qrXml: string | null
}

export const RemoteVaultScreen: FC<AppStackScreenProps<"RemoteVault">> = function RemoteVaultScreen(props) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [vaults, setVaults] = useState<VaultDTO[]>([])
  const [devices, setDevices] = useState<DeviceDTO[]>([])
  const [requests, setRequests] = useState<VaultAccessRequestDTO[]>([])
  const [vaultAccessDevices, setVaultAccessDevices] = useState<Record<string, DeviceDTO[]>>({})
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [account, setAccount] = useState(() => getAccount())
  const [currentVaultId, setCurrentVaultId] = useState<string | null>(() => getRemoteVaultId())
  const [creatingVault, setCreatingVault] = useState(false)
  const [newVaultName, setNewVaultName] = useState("")
  const [vaultKeyPresence, setVaultKeyPresence] = useState<Record<string, boolean>>({})
  const [generatedAccess, setGeneratedAccess] = useState<GeneratedVaultAccess | null>(null)
  const [editingVaultId, setEditingVaultId] = useState<string | null>(null)
  const [editingVaultName, setEditingVaultName] = useState("")

  const refresh = useCallback(async () => {
    const acct = getAccount()
    setAccount(acct)
    setCurrentVaultId(getRemoteVaultId())
    if (!acct) {
      setVaults([])
      setDevices([])
      setRequests([])
      return
    }

    setLoading(true)
    try {
      const [vaultData, deviceData, requestData] = await Promise.all([
        fetchJson<{ vaults: VaultDTO[] }>("/v1/vaults"),
        fetchJson<{ devices: DeviceDTO[] }>("/v1/devices"),
        fetchJson<{ requests: VaultAccessRequestDTO[] }>("/v1/vault-access-requests"),
      ])
      const nextVaults = vaultData.vaults ?? []
      setVaults(nextVaults)
      setDevices(deviceData.devices ?? [])
      setRequests(requestData.requests ?? [])
      setRemoteVaultCatalog(nextVaults)
      setCurrentVaultId(getRemoteVaultId())
      const keyStatusEntries = await Promise.all(
        nextVaults.map(async (vault) => [vault.id, !!(await getRemoteVaultKey(vault.id))] as const),
      )
      setVaultKeyPresence(Object.fromEntries(keyStatusEntries))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account vaults")
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      void refresh()
    }, [navigation, refresh]),
  )

  const currentDevice = useMemo(
    () => devices.find((device) => device.current) ?? devices.find((device) => device.id === account?.device.id) ?? null,
    [account?.device.id, devices],
  )

  const pendingApprovals = useMemo(
    () =>
      requests.filter((request) => {
        if (request.status !== "pending") return false
        if (!currentDevice || request.requestingDeviceId === currentDevice.id) return false
        return vaultKeyPresence[request.vaultId] === true
      }),
    [currentDevice, requests, vaultKeyPresence],
  )

  const myVaultRequestsByVaultId = useMemo(() => {
    const map = new Map<string, VaultAccessRequestDTO>()
    if (!currentDevice) return map
    for (const request of requests) {
      if (request.requestingDeviceId !== currentDevice.id) continue
      if (!["pending", "approved"].includes(request.status)) continue
      map.set(request.vaultId, request)
    }
    return map
  }, [currentDevice, requests])

  const handleCreateVault = useCallback(async () => {
    setError(null)
    setStatus(null)
    const trimmedName = newVaultName.trim()
    if (!trimmedName) {
      setError("Enter a vault name")
      return
    }
    try {
      const data = await fetchJson<{ vault: VaultDTO }>("/v1/vaults", {
        method: "POST",
        body: JSON.stringify({ name: trimmedName }),
      })
      await provisionVaultForCurrentUser(data.vault.id)
      setStatus(`${data.vault.name} created and ready to sync.`)
      setVaultEnabledOnDevice(data.vault.id, true, { name: data.vault.name })
      setRemoteVaultId(data.vault.id, data.vault.name)
      setCurrentVaultId(data.vault.id)
      setCreatingVault(false)
      setNewVaultName("")
      await refresh()
      void requestSync("vault_enabled", data.vault.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create vault")
    }
  }, [newVaultName, refresh])

  const buildVaultQr = useCallback(async (vault: VaultDTO, pairingCode: string) => {
    const payload = encodeVaultAccessQrPayload({
      vaultId: vault.id,
      vaultName: vault.name,
      pairingCode,
    })
    return QRCode.toString(payload, { type: "svg", margin: 1, width: 220 })
  }, [])

  const handleGenerateVaultAccess = useCallback(
    async (vault: VaultDTO) => {
      setError(null)
      setStatus(null)
      try {
        const rvk = await getRemoteVaultKey(vault.id)
        if (!rvk) {
          setError(`${vault.name} is not provisioned on this device yet.`)
          return
        }
        const pairingCode = generatePairingCode()
        const wrappedVaultKeyB64 = buildWrappedVaultKeyPayload({ pairingCode, vaultId: vault.id, rvk })
        const data = await fetchJson<{ pairingCode: string; expiresAt: string }>(`/v1/vaults/${vault.id}/pairing-codes`, {
          method: "POST",
          body: JSON.stringify({ pairingCode, wrappedVaultKeyB64 }),
        })
        const qrXml = await buildVaultQr(vault, data.pairingCode)
        setGeneratedAccess({ vaultId: vault.id, code: data.pairingCode, expiresAt: data.expiresAt, qrXml })
        setStatus(`Vault access ready for ${vault.name}.`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create access code")
      }
    },
    [buildVaultQr],
  )

  const handleRemoveFromDevice = useCallback(
    (vault: VaultDTO) => {
      if (!account?.device.id) return
      Alert.alert(
        "Remove from this device",
        `Remove ${vault.name} from this device? Its local key, cache, and search index will be cleared here.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                await fetchJson(`/v1/devices/${account.device.id}/vaults/${vault.id}`, { method: "DELETE" })
                await removeVaultFromCurrentDevice(vault.id, vault.name)
                setStatus(`${vault.name} removed from this device.`)
                await refresh()
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to remove vault from this device")
              }
            },
          },
        ],
      )
    },
    [account?.device.id, refresh],
  )

  const handleRenameVault = useCallback(
    async (vault: VaultDTO) => {
      const nextName = editingVaultName.trim()
      if (!nextName) {
        setError("Enter a vault name")
        return
      }
      try {
        await fetchJson<{ vault: VaultDTO }>(`/v1/vaults/${vault.id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: nextName }),
        })
        renameRemoteVault(vault.id, nextName)
        setEditingVaultId(null)
        setEditingVaultName("")
        setStatus(`Renamed vault to ${nextName}.`)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to rename vault")
      }
    },
    [editingVaultName, refresh],
  )

  const handleDeleteVault = useCallback(
    (vault: VaultDTO) => {
      Alert.alert(
        "Delete vault",
        `Delete ${vault.name}? This removes it from all of your devices and stops sync for that vault.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete vault",
            style: "destructive",
            onPress: async () => {
              try {
                await fetchJson(`/v1/vaults/${vault.id}`, { method: "DELETE" })
                await forgetDeletedVaultLocally(vault.id)
                setStatus(`${vault.name} deleted.`)
                await refresh()
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to delete vault")
              }
            },
          },
        ],
      )
    },
    [refresh],
  )

  const handleLoadVaultDevices = useCallback(async (vault: VaultDTO) => {
    let shouldFetch = true
    setVaultAccessDevices((current) => {
      if (current[vault.id]) {
        shouldFetch = false
        const next = { ...current }
        delete next[vault.id]
        return next
      }
      return current
    })
    if (!shouldFetch) return
    try {
      const data = await fetchJson<{ devices: DeviceDTO[] }>(`/v1/vaults/${vault.id}/devices`)
      setVaultAccessDevices((current) => ({ ...current, [vault.id]: data.devices ?? [] }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vault devices")
    }
  }, [])

  const handleRevokeVaultFromDevice = useCallback(
    (vault: VaultDTO, device: DeviceDTO) => {
      Alert.alert(
        "Revoke vault access",
        `Revoke ${vault.name} from ${device.name}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Revoke",
            style: "destructive",
            onPress: async () => {
              try {
                await fetchJson(`/v1/devices/${device.id}/vaults/${vault.id}`, { method: "DELETE" })
                if (device.id === account?.device.id) {
                  await removeVaultFromCurrentDevice(vault.id, vault.name)
                }
                setStatus(`${vault.name} revoked from ${device.name}.`)
                await refresh()
                await handleLoadVaultDevices(vault)
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to revoke vault")
              }
            },
          },
        ],
      )
    },
    [account?.device.id, handleLoadVaultDevices, refresh],
  )

  const handleSyncNow = useCallback(
    async (vaultId: string) => {
      setError(null)
      setStatus(null)
      try {
        const result = await requestSync("manual", vaultId)
        setStatus(
          `Sync complete for ${vaults.find((vault) => vault.id === vaultId)?.name ?? "vault"}: pushed ${result?.pushed ?? 0}, pulled ${result?.pulled ?? 0}.`,
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sync failed")
      }
    },
    [vaults],
  )

  const handleRemoveDevice = useCallback(
    (device: DeviceDTO) => {
      if (!device.id || device.current) return
      Alert.alert("Remove device", `Remove ${device.name} from your Locker account?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await fetchJson(`/v1/devices/${device.id}`, { method: "DELETE" })
              setStatus(`${device.name} removed.`)
              await refresh()
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to remove device")
            }
          },
        },
      ])
    },
    [refresh],
  )

  const handleRequestAccess = useCallback(
    async (vault: VaultDTO) => {
      if (!account?.device.id) return
      try {
        const { requesterPublicKey, privateKey } = createVaultAccessRequestKeypair(vault.id)
        const data = await fetchJson<{ request: { id: string; requesterPublicKey: string } }>(
          `/v1/vaults/${vault.id}/access-requests`,
          {
            method: "POST",
            body: JSON.stringify({
              requestingDeviceId: account.device.id,
              requesterPublicKey,
            }),
          },
        )
        storeVaultAccessRequestKeypair({
          requestId: data.request.id,
          vaultId: vault.id,
          requesterPublicKey: data.request.requesterPublicKey,
          privateKey,
        })
        setStatus(`Access request sent for ${vault.name}. Approve it from another linked device that already has this vault.`)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to request access")
      }
    },
    [account?.device.id, refresh],
  )

  const handleApproveRequest = useCallback(
    async (request: VaultAccessRequestDTO) => {
      try {
        const rvk = await getRemoteVaultKey(request.vaultId)
        if (!rvk || !request.requesterPublicKey) {
          setError("This device cannot approve that request.")
          return
        }
        const wrappedVaultKeyB64 = buildVaultKeyEnvelope(request.requesterPublicKey, rvk)
        await fetchJson(`/v1/vault-access-requests/${request.id}/approve`, {
          method: "POST",
          body: JSON.stringify({ wrappedVaultKeyB64 }),
        })
        setStatus(`Approved ${request.vaultName ?? "vault"} for ${request.requestingDeviceName ?? "device"}.`)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve request")
      }
    },
    [refresh],
  )

  const handleRejectRequest = useCallback(
    async (request: VaultAccessRequestDTO) => {
      try {
        await fetchJson(`/v1/vault-access-requests/${request.id}/reject`, { method: "POST" })
        setStatus(`Rejected request for ${request.vaultName ?? "vault"}.`)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to reject request")
      }
    },
    [refresh],
  )

  const redeemApprovedRequest = useCallback(
    async (request: VaultAccessRequestDTO) => {
      const privateKey = getVaultAccessRequestPrivateKey(request.id)
      if (!privateKey) return
      try {
        const data = await fetchJson<{ vaultId: string; wrappedVaultKeyB64: string; enabledAt: string }>(
          `/v1/vault-access-requests/${request.id}/redeem`,
          { method: "POST" },
        )
        const envelope = decodeEnvelopeFromBase64(data.wrappedVaultKeyB64)
        const rvk = openSealedBoxEnvelope(privateKey, envelope)
        await setRemoteVaultKey(data.vaultId, rvk)
        setVaultEnabledOnDevice(data.vaultId, true, {
          name: request.vaultName,
          enabledAt: data.enabledAt,
        })
        clearVaultAccessRequestKeypair(request.id)
        setStatus(`${request.vaultName ?? "Vault"} added to this device.`)
        void requestSync("vault_enabled", data.vaultId)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to redeem access request")
      }
    },
    [refresh],
  )

  useEffect(() => {
    const approved = requests.filter((request) => {
      if (!currentDevice) return false
      return request.requestingDeviceId === currentDevice.id && request.status === "approved"
    })
    if (approved.length === 0) return
    void Promise.all(approved.map((request) => redeemApprovedRequest(request))).catch(() => {})
  }, [currentDevice, redeemApprovedRequest, requests])

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Vaults & Devices
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Manage your vaults, linked devices, and same-user vault access approvals.
        </Text>
      </View>

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}
      {status ? <Text style={themed($statusText)}>{status}</Text> : null}

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Account
        </Text>
        <Text style={themed($metaText)}>User: {account?.user.email ?? account?.user.id ?? "Not linked"}</Text>
        <Text style={themed($metaText)}>Current device: {currentDevice?.name ?? account?.device.name ?? "n/a"}</Text>
        {loading ? <Text style={themed($metaText)}>Refreshing account state…</Text> : null}
        {!account ? (
          <Pressable style={themed($primaryButton)} onPress={() => navigation.navigate("VaultLinkDevice")}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              I Already Use Locker
            </Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={themed($primaryButton)} onPress={() => navigation.navigate("VaultPairDevice")}>
              <Text preset="bold" style={themed($primaryButtonText)}>
                Add Another Device
              </Text>
            </Pressable>
            <Pressable style={themed($secondaryButton)} onPress={() => void refresh()}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Refresh
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {pendingApprovals.length > 0 ? (
        <View style={themed($card)}>
          <Text preset="bold" style={themed($sectionTitle)}>
            Pending Approvals
          </Text>
          {pendingApprovals.map((request) => (
            <View key={request.id} style={themed($rowCard)}>
              <Text preset="bold" style={themed($rowTitle)}>
                {request.vaultName ?? "Vault"} requested by {request.requestingDeviceName ?? "device"}
              </Text>
              <Text style={themed($metaText)}>
                Expires: {new Date(request.expiresAt).toLocaleTimeString()}
              </Text>
              <Pressable style={themed($secondaryButton)} onPress={() => void handleApproveRequest(request)}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Approve request
                </Text>
              </Pressable>
              <Pressable style={themed($secondaryButton)} onPress={() => void handleRejectRequest(request)}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Reject request
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Vaults
        </Text>
        <Text style={themed($bodyText)}>
          Personal is automatic. Additional vaults stay explicit per device and need real provisioning before they sync.
        </Text>

        {creatingVault ? (
          <View style={themed($createVaultCard)}>
            <TextInput
              value={newVaultName}
              onChangeText={setNewVaultName}
              placeholder="Vault name"
              placeholderTextColor="#9aa0a6"
              style={themed($input)}
            />
            <Pressable style={themed($primaryButton)} onPress={() => void handleCreateVault()}>
              <Text preset="bold" style={themed($primaryButtonText)}>
                Create Vault
              </Text>
            </Pressable>
            <Pressable
              style={themed($secondaryButton)}
              onPress={() => {
                setCreatingVault(false)
                setNewVaultName("")
              }}
            >
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Cancel
              </Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={themed($primaryButton)} onPress={() => setCreatingVault(true)}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              Create Additional Vault
            </Text>
          </Pressable>
        )}

        {vaults.map((vault) => {
          const syncStatus = getSyncStatus(vault.id)
          const enabled = listRemoteVaults().find((item) => item.id === vault.id)?.enabledOnDevice ?? !!vault.enabledOnDevice
          const provisioned = vaultKeyPresence[vault.id] === true
          const isPersonal = vault.name === PERSONAL_VAULT_NAME
          const request = myVaultRequestsByVaultId.get(vault.id) ?? null
          const accessDevices = vaultAccessDevices[vault.id] ?? []
          const isEditing = editingVaultId === vault.id

          return (
            <View key={vault.id} style={themed($rowCard)}>
              <Text preset="bold" style={themed($rowTitle)}>
                {vault.name}
              </Text>
              <Text style={themed($metaText)}>
                {currentVaultId === vault.id && enabled && provisioned
                  ? "Current vault"
                  : enabled
                    ? provisioned
                      ? "Available on this device"
                      : "Access code required"
                    : "Not on this device"}
              </Text>
              <Text style={themed($metaText)}>
                Last synced: {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : "Not yet"}
              </Text>
              <Text style={themed($metaText)}>
                {request?.status === "pending"
                  ? "Awaiting approval"
                  : request?.status === "approved"
                    ? "Approval ready"
                    : provisioned
                      ? `Queue: ${syncStatus.queueSize}`
                      : "This device does not have the vault key yet"}
              </Text>
              {syncStatus.lastError ? <Text style={themed($errorText)}>{syncStatus.lastError}</Text> : null}

              {generatedAccess?.vaultId === vault.id ? (
                <View style={themed($qrCard)}>
                  <Text preset="bold" style={themed($rowTitle)}>
                    One-time access ready
                  </Text>
                  <Text style={themed($metaText)}>{generatedAccess.code}</Text>
                  <Text style={themed($metaText)}>
                    Expires: {new Date(generatedAccess.expiresAt).toLocaleTimeString()}
                  </Text>
                  {generatedAccess.qrXml ? <SvgXml xml={generatedAccess.qrXml} width={220} height={220} /> : null}
                </View>
              ) : null}

              {isEditing ? (
                <View style={themed($createVaultCard)}>
                  <TextInput
                    value={editingVaultName}
                    onChangeText={setEditingVaultName}
                    placeholder="Vault name"
                    placeholderTextColor="#9aa0a6"
                    style={themed($input)}
                  />
                  <Pressable style={themed($primaryButton)} onPress={() => void handleRenameVault(vault)}>
                    <Text preset="bold" style={themed($primaryButtonText)}>
                      Save name
                    </Text>
                  </Pressable>
                  <Pressable
                    style={themed($secondaryButton)}
                    onPress={() => {
                      setEditingVaultId(null)
                      setEditingVaultName("")
                    }}
                  >
                    <Text preset="bold" style={themed($secondaryButtonText)}>
                      Cancel
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={themed($buttonRow)}>
                {enabled && provisioned ? (
                  <Pressable
                    style={themed($secondaryButton)}
                    onPress={() => {
                      setRemoteVaultId(vault.id, vault.name)
                      setCurrentVaultId(vault.id)
                    }}
                  >
                    <Text preset="bold" style={themed($secondaryButtonText)}>
                      {currentVaultId === vault.id ? "Current vault" : "Switch to this vault"}
                    </Text>
                  </Pressable>
                ) : null}

                {enabled && provisioned ? (
                  <Pressable style={themed($secondaryButton)} onPress={() => void handleSyncNow(vault.id)}>
                    <Text preset="bold" style={themed($secondaryButtonText)}>
                      Sync now
                    </Text>
                  </Pressable>
                ) : null}

                <Pressable style={themed($secondaryButton)} onPress={() => void handleLoadVaultDevices(vault)}>
                  <Text preset="bold" style={themed($secondaryButtonText)}>
                    {vaultAccessDevices[vault.id] ? "Hide device access" : "View device access"}
                  </Text>
                </Pressable>

                {!isPersonal && enabled && provisioned ? (
                  <>
                    <Pressable style={themed($secondaryButton)} onPress={() => void handleGenerateVaultAccess(vault)}>
                      <Text preset="bold" style={themed($secondaryButtonText)}>
                        Generate code / QR
                      </Text>
                    </Pressable>
                    <Pressable
                      style={themed($secondaryButton)}
                      onPress={() => {
                        setEditingVaultId(vault.id)
                        setEditingVaultName(vault.name)
                      }}
                    >
                      <Text preset="bold" style={themed($secondaryButtonText)}>
                        Rename vault
                      </Text>
                    </Pressable>
                    <Pressable style={themed($secondaryButton)} onPress={() => handleRemoveFromDevice(vault)}>
                      <Text preset="bold" style={themed($secondaryButtonText)}>
                        Remove from this device
                      </Text>
                    </Pressable>
                    <Pressable style={themed($secondaryButton)} onPress={() => handleDeleteVault(vault)}>
                      <Text preset="bold" style={themed($secondaryButtonText)}>
                        Delete vault
                      </Text>
                    </Pressable>
                  </>
                ) : null}

                {!enabled && !isPersonal ? (
                  <>
                    <Pressable
                      style={themed($primaryButton)}
                      onPress={() => navigation.navigate("VaultImportPairing", { vaultId: vault.id, vaultName: vault.name })}
                    >
                      <Text preset="bold" style={themed($primaryButtonText)}>
                        Add to this device
                      </Text>
                    </Pressable>
                    <Pressable
                      style={themed($secondaryButton)}
                      onPress={() => navigation.navigate("VaultImportPairing", { vaultId: vault.id, vaultName: vault.name })}
                    >
                      <Text preset="bold" style={themed($secondaryButtonText)}>
                        Enter access code
                      </Text>
                    </Pressable>
                    <Pressable
                      style={themed($secondaryButton)}
                      onPress={() => navigation.navigate("VaultQrScanner", { mode: "vault-access", vaultId: vault.id, vaultName: vault.name })}
                    >
                      <Text preset="bold" style={themed($secondaryButtonText)}>
                        Scan QR
                      </Text>
                    </Pressable>
                    <Pressable style={themed($secondaryButton)} onPress={() => void handleRequestAccess(vault)}>
                      <Text preset="bold" style={themed($secondaryButtonText)}>
                        Request access
                      </Text>
                    </Pressable>
                  </>
                ) : null}

                {enabled && !provisioned && !isPersonal ? (
                  <>
                    <Pressable
                      style={themed($primaryButton)}
                      onPress={() => navigation.navigate("VaultImportPairing", { vaultId: vault.id, vaultName: vault.name })}
                    >
                      <Text preset="bold" style={themed($primaryButtonText)}>
                        Enter access code
                      </Text>
                    </Pressable>
                    <Pressable
                      style={themed($secondaryButton)}
                      onPress={() => navigation.navigate("VaultQrScanner", { mode: "vault-access", vaultId: vault.id, vaultName: vault.name })}
                    >
                      <Text preset="bold" style={themed($secondaryButtonText)}>
                        Scan QR
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>

              {vaultAccessDevices[vault.id] ? (
                <View style={themed($deviceList)}>
                  {accessDevices.map((device) => (
                    <View key={device.id} style={themed($deviceAccessRow)}>
                      <View style={themed($deviceAccessMeta)}>
                        <Text preset="bold" style={themed($metaStrong)}>
                          {device.name} {device.id === account?.device.id ? "• This device" : ""}
                        </Text>
                        <Text style={themed($metaText)}>
                          Last active: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "Unknown"}
                        </Text>
                      </View>
                      {!isPersonal ? (
                        <Pressable style={themed($miniButton)} onPress={() => handleRevokeVaultFromDevice(vault, device)}>
                          <Text preset="bold" style={themed($secondaryButtonText)}>
                            Revoke
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          )
        })}
      </View>

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Devices
        </Text>
        {devices.map((device) => (
          <View key={device.id} style={themed($rowCard)}>
            <Text preset="bold" style={themed($rowTitle)}>
              {device.name} {device.current ? "• This device" : ""}
            </Text>
            <Text style={themed($metaText)}>
              Last active: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "Unknown"}
            </Text>
            {!device.current ? (
              <Pressable style={themed($secondaryButton)} onPress={() => handleRemoveDevice(device)}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Remove device
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexGrow: 1,
  backgroundColor: colors.palette.neutral900,
  paddingHorizontal: spacing.xl,
  gap: spacing.md,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.xl,
  gap: spacing.xs,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  padding: spacing.md,
  borderRadius: 18,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
})

const $rowCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: "rgba(255,255,255,0.08)",
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $rowTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

const $metaStrong: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $bodyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
  lineHeight: 22,
})

const $createVaultCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $qrCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  alignItems: "center",
  paddingVertical: spacing.sm,
})

const $input: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255,255,255,0.08)",
  borderRadius: 14,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  color: colors.palette.neutral100,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.15)",
})

const $buttonRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  marginTop: spacing.xs,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255,255,255,0.08)",
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
})

const $miniButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255,255,255,0.08)",
  borderRadius: 12,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $deviceList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  marginTop: spacing.xs,
})

const $deviceAccessRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
})

const $deviceAccessMeta: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 4,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
})

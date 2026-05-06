import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Pressable, ScrollView, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { Ionicons } from "@expo/vector-icons"
import {
  ChevronDown,
  ChevronUp,
  HardDrive,
  KeyRound,
  PencilLine,
  Plus,
  QrCode,
  RefreshCw,
  Shield,
  Smartphone,
  Trash2,
} from "lucide-react-native"
import QRCode from "qrcode"
import { SvgXml } from "react-native-svg"

import { DeviceDTO, VaultAccessRequestDTO, VaultDTO } from "@locker/types"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { VaultHubBackground } from "@/components/VaultHubBackground"
import { GhostButton } from "@/components/vault-note/GhostButton"
import { GhostDangerButton } from "@/components/vault-note/GhostDangerButton"
import { GlassSection } from "@/components/vault-note/GlassSection"
import { GradientPrimaryButton } from "@/components/vault-note/GradientPrimaryButton"
import { GlassChip } from "@/components/vault-note/GlassChip"
import { IconTextInput } from "@/components/vault-note/IconTextInput"
import { MetaChip } from "@/components/vault-note/MetaChip"
import { MiniIconButton } from "@/components/vault-note/MiniIconButton"
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
import { buildWrappedVaultKeyPayload, generatePairingCode } from "@/locker/pairing/pairingCode"
import {
  clearVaultAccessRequestKeypair,
  createVaultAccessRequestKeypair,
  getVaultAccessRequestPrivateKey,
  storeVaultAccessRequestKeypair,
} from "@/locker/linking/vaultAccessRequestRepo"
import { decodeEnvelopeFromBase64, openSealedBoxEnvelope } from "@/locker/crypto/sealedBox"
import { encodeVaultAccessQrPayload } from "@/locker/linking/qrPayload"
import { forgetDeletedVaultLocally, removeVaultFromCurrentDevice } from "@/locker/vaults/deviceVaultCleanup"
import { typography } from "@/theme/typography"
import { DescriptionChip } from "@/components/vault-note/DescriptionChip"

const PERSONAL_VAULT_NAME = "Personal"

type GeneratedVaultAccess = {
  vaultId: string
  code: string
  expiresAt: string
  qrXml: string | null
}

export const RemoteVaultScreen: FC<AppStackScreenProps<"RemoteVault">> = function RemoteVaultScreen(props) {
  const { navigation } = props
  const { themed, theme } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [vaults, setVaults] = useState<VaultDTO[]>([])
  const [devices, setDevices] = useState<DeviceDTO[]>([])
  const [requests, setRequests] = useState<VaultAccessRequestDTO[]>([])
  const [vaultAccessDevices, setVaultAccessDevices] = useState<Record<string, DeviceDTO[]>>({})
  const [expandedVaultIds, setExpandedVaultIds] = useState<Record<string, boolean>>({})
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

  const openVaultPanel = useCallback((vaultId: string) => {
    setExpandedVaultIds((current) => ({ ...current, [vaultId]: true }))
  }, [])

  const toggleVaultPanel = useCallback((vaultId: string) => {
    setExpandedVaultIds((current) => ({ ...current, [vaultId]: !current[vaultId] }))
  }, [])

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
      openVaultPanel(data.vault.id)
      await refresh()
      void requestSync("vault_enabled", data.vault.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create vault")
    }
  }, [newVaultName, openVaultPanel, refresh])

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
        openVaultPanel(vault.id)
        setStatus(`Vault access ready for ${vault.name}.`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create access code")
      }
    },
    [buildVaultQr, openVaultPanel],
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
      openVaultPanel(vault.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load vault devices")
    }
  }, [openVaultPanel])

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
        openVaultPanel(vault.id)
        setStatus(`Access request sent for ${vault.name}. Approve it from another linked device that already has this vault.`)
        await refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to request access")
      }
    },
    [account?.device.id, openVaultPanel, refresh],
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

  const accountLabel = account?.user.email ?? account?.user.id ?? "Not linked"
  const deviceLabel = currentDevice?.name ?? account?.device.name ?? "n/a"

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <VaultHubBackground reducedMotion dimmed />

      <ScrollView contentContainerStyle={themed($content)} showsVerticalScrollIndicator={false}>
          <View style={themed($heroTopRow)}>
            <View style={themed($heroBadge)}>
              <Shield size={13} color="#FFD8FA" />
              <Text style={themed($heroBadgeText)}>REMOTE CONTROL</Text>
            </View>
            <View style={themed($heroMetaRow)}>
              <MetaChip themed={themed} label={loading ? "Refreshing" : "Ready"} />
            </View>
          </View>

          <View style={themed($heroTitleRow)}>
            {/* <View style={themed($heroIconWrap)}>
              <HardDrive size={20} color="#FFF5FF" />
            </View> */}
            <View style={themed($heroTextWrap)}>
              <Text style={themed($heroTitle)}>Vaults & Devices</Text>
              <Text style={themed($heroSubtitle)}>
                Vaults can stay on this device or sync securly between other devices that you approve.
              </Text>
            </View>
          </View>
        {/* <View style={themed($heroCard)}> */}

          {/* <View style={themed($heroDetails)}>
            <MetaChip themed={themed} label={`Account ${accountLabel}`} />
            <MetaChip themed={themed} label={`This device ${deviceLabel}`} />
          </View> */}

         
        {/* </View> */}

        {error ? (
          <View style={themed($errorBanner)}>
            <Ionicons name="alert-circle-outline" size={15} color="#FFB6C7" />
            <Text style={themed($errorBannerText)}>{error}</Text>
          </View>
        ) : null}

        {status ? (
          <View style={themed($statusBanner)}>
            <Ionicons name="sparkles-outline" size={15} color="#FFD4FF" />
            <Text style={themed($statusBannerText)}>{status}</Text>
          </View>
        ) : null}

        {pendingApprovals.length > 0 ? (
          <GlassSection
            themed={themed}
            title="Pending Approvals"
            subtitle="Approve requests from your other linked devices that still need vault access."
            icon={<Shield size={14} color="#FFC8F3" />}
          >
            <View style={themed($stack)}>
              {pendingApprovals.map((request) => (
                <View key={request.id} style={themed($inlineCard)}>
                  <View style={themed($cardHeader)}>
                    <View style={themed($cardTitleBlock)}>
                      <Text style={themed($cardTitle)}>{request.vaultName ?? "Vault"}</Text>
                      <Text style={themed($cardSubtitle)}>
                        Requested by {request.requestingDeviceName ?? "device"}
                      </Text>
                    </View>
                    <MetaChip themed={themed} label={`Expires ${formatShortDate(request.expiresAt)}`} />
                  </View>

                  <View style={themed($buttonPair)}>
                    <GhostButton
                      themed={themed}
                      label="Approve"
                      icon={<Shield size={15} color="#F9E7FF" />}
                      onPress={() => void handleApproveRequest(request)}
                    />
                    <GhostDangerButton
                      themed={themed}
                      label="Reject"
                      icon={<Trash2 size={15} color="#FF9EB7" />}
                      onPress={() => void handleRejectRequest(request)}
                    />
                  </View>
                </View>
              ))}
            </View>
          </GlassSection>
        ) : null}

        <GlassSection
          themed={themed}
          title="Vaults"
          // subtitle="Vaults can stay on this device or sync securly between other devices that you approve."
          // icon={<HardDrive size={14} color="#FFC8F3" />}
          rightSlot={
            !creatingVault ? (
              <Pressable onPress={() => setCreatingVault(true)} style={themed($headerActionPill)}>
                <Plus size={14} color="#F8DEFF" />
                <Text style={themed($headerActionText)}>Create</Text>
                <HardDrive size={14} color="#FFC8F3" />
              </Pressable>
            ) : null
          }
        >
          {creatingVault ? (
            <View style={themed($editorCard)}>
              <IconTextInput
                themed={themed}
                theme={theme}
                placeholder="Vault name"
                value={newVaultName}
                onChangeText={setNewVaultName}
                icon={<HardDrive size={15} color="rgba(255,255,255,0.75)" />}
                multiline={false}
                inputStyle={themed($titleInput)}
              />

              <View style={themed($buttonPair)}>
                <GhostButton
                  themed={themed}
                  label="Cancel"
                  containerStyle={{height: 20, borderRadius: 30}}
                  icon={<Ionicons name="close-outline" size={16} color="#F9E7FF" />}
                  onPress={() => {
                    setCreatingVault(false)
                    setNewVaultName("")
                  }}
                />

                {/* <GlassChip themed={themed} label="Create Vault" />  */}
                 {/* <GlassChip themed={themed} label="Create Vault" onPress={() => void handleCreateVault()}/> */}

                <GradientPrimaryButton
                  themed={themed}
                  label="Create Vault"
                  containerStyle={{height: 40, borderRadius: 30, paddingHorizontal: 20,}}
                  textStyle={{fontSize: 13, fontStyle: typography.primary.normal, marginTop:-10}}
                  icon={<Plus size={15} color="#1D0820" />}
                  onPress={() => void handleCreateVault()}
                />
              </View>
            </View>
          ) : null}

          <View style={themed($stack)}>
            {vaults.map((vault) => {
              const syncStatus = getSyncStatus(vault.id)
              const enabled = listRemoteVaults().find((item) => item.id === vault.id)?.enabledOnDevice ?? !!vault.enabledOnDevice
              const provisioned = vaultKeyPresence[vault.id] === true
              const isPersonal = vault.name === PERSONAL_VAULT_NAME
              const request = myVaultRequestsByVaultId.get(vault.id) ?? null
              const accessDevices = vaultAccessDevices[vault.id] ?? []
              const isEditing = editingVaultId === vault.id
              const isExpanded = !!expandedVaultIds[vault.id]
              const currentGeneratedAccess = generatedAccess?.vaultId === vault.id ? generatedAccess : null

              return (
                <View key={vault.id} style={themed($vaultCard)}>
                  <Pressable style={themed($vaultHeader)} onPress={() => toggleVaultPanel(vault.id)}>
                    <View style={themed($vaultHeaderTop)}>
                      <View style={themed($cardTitleBlock)}>
                        <Text style={themed($cardTitle)}>{vault.name}</Text>
                        <Text style={themed($cardSubtitle)}>
                          {enabled && provisioned
                            ? currentVaultId === vault.id
                              ? "Active and secured on this device"
                              : "Available on this device"
                            : enabled
                              ? "Enabled here, waiting for key material"
                              : "Not enabled on this device"}
                        </Text>
                      </View>
                      <View style={themed($expandPill)}>
                        {isExpanded ? (
                          <ChevronUp size={16} color="#FFE6FE" />
                        ) : (
                          <ChevronDown size={16} color="#FFE6FE" />
                        )}
                      </View>
                    </View>

                    <View style={themed($chipRow)}>
                      {currentVaultId === vault.id ? <GlassChip themed={themed} label="Current vault" selected /> : null}
                      {enabled ? null : <DescriptionChip themed={themed} label="Needs Access" />}
                      {/* {provisioned ? <DescriptionChip themed={themed} label="Active" /> : <DescriptionChip themed={themed} label="Needs access" />} */}
                      {/* {isPersonal ? <DescriptionChip themed={themed} label="Personal" /> : null} */}
                      {request?.status === "pending" ? <DescriptionChip themed={themed} label="Request pending" /> : null}
                      {request?.status === "approved" ? <DescriptionChip themed={themed} label="Approval ready" /> : null}
                    </View>

                    <View style={themed($metaGrid)}>
                      <DescriptionChip
                        themed={themed}
                        label={`Last Synced: ${syncStatus.lastSyncAt ? formatShortDate(syncStatus.lastSyncAt) : "Not Synced"}`}
                      />
                      {/* <DescriptionChip themed={themed} label={syncStatus.queueSize === 0 ? `Synced`: `Pendign Sync${syncStatus.queueSize}`} /> */}
                      {/* <DescriptionChip
                        themed={themed}
                        label={
                          request?.status === "pending"
                            ? "Awaiting approval"
                            : request?.status === "approved"
                              ? "Ready to redeem"
                              : provisioned
                                ? "Key present"
                                : "Key missing"
                        }
                      /> */}
                    </View>

                    {syncStatus.lastError ? (
                      <View style={themed($inlineInfoBanner)}>
                        <Ionicons name="warning-outline" size={14} color="#FFB6C7" />
                        <Text style={themed($inlineInfoText)}>{syncStatus.lastError}</Text>
                      </View>
                    ) : null}
                  </Pressable>

                  {isExpanded ? (
                    <View style={themed($vaultExpanded)}>
                      <View style={themed($actionGrid)}>
                        {enabled && provisioned && currentVaultId !== vault.id ? (
                          <MiniIconButton
                            themed={themed}
                            label={"Use Vault"}
                            icon={<Shield size={14} color="#FFE8FD" />}
                            onPress={() => {
                              setRemoteVaultId(vault.id, vault.name)
                              setCurrentVaultId(vault.id)
                            }}
                            disabled={currentVaultId === vault.id}
                          />
                        ) :  null}

                        {enabled && provisioned ? (
                          <MiniIconButton
                            themed={themed}
                            label="Sync Now"
                            icon={<RefreshCw size={14} color="#FFE8FD" />}
                            onPress={() => void handleSyncNow(vault.id)}
                          />
                        ) : null}

                        <MiniIconButton
                          themed={themed}
                          label={vaultAccessDevices[vault.id] ? "Hide Devices" : "Show Devices"}
                          icon={<Smartphone size={14} color="#FFE8FD" />}
                          onPress={() => {
                            vaultAccessDevices[vault.id]?
                            setVaultAccessDevices({})
                            : void handleLoadVaultDevices(vault)}}
                        />

                        {!isPersonal && enabled && provisioned ? (
                          <MiniIconButton
                            themed={themed}
                            label={currentGeneratedAccess?"Hide Generate Access" :"Generate Access"}
                            icon={<QrCode size={14} color="#FFE8FD" />}
                            onPress={() => {
                              currentGeneratedAccess?
                              setGeneratedAccess(null)
                              : void handleGenerateVaultAccess(vault)
                            }}
                          />
                        ) : null}

                        {!enabled && !isPersonal ? (
                          <MiniIconButton
                            themed={themed}
                            label="Add Device"
                            icon={<Plus size={14} color="#FFE8FD" />}
                            onPress={() => navigation.navigate("VaultImportPairing", { vaultId: vault.id, vaultName: vault.name })}
                          />
                        ) : null}

                        {(!enabled || !provisioned) && !isPersonal ? (
                          <>
                            <MiniIconButton
                              themed={themed}
                              label="Enter Code"
                              icon={<KeyRound size={14} color="#FFE8FD" />}
                              onPress={() => navigation.navigate("VaultImportPairing", { vaultId: vault.id, vaultName: vault.name })}
                            />
                            <MiniIconButton
                              themed={themed}
                              label="Scan QR"
                              icon={<QrCode size={14} color="#FFE8FD" />}
                              onPress={() =>
                                navigation.navigate("VaultQrScanner", {
                                  mode: "vault-access",
                                  vaultId: vault.id,
                                  vaultName: vault.name,
                                })
                              }
                            />
                          </>
                        ) : null}

                        {!enabled && !isPersonal ? (
                          <MiniIconButton
                            themed={themed}
                            label="Request Access"
                            icon={<Shield size={14} color="#FFE8FD" />}
                            onPress={() => void handleRequestAccess(vault)}
                          />
                        ) : null}

                        {!isPersonal && enabled && provisioned ? (
                          <MiniIconButton
                            themed={themed}
                            label="Rename"
                            icon={<PencilLine size={14} color="#FFE8FD" />}
                            onPress={() => {
                              setEditingVaultId(vault.id)
                              setEditingVaultName(vault.name)
                              openVaultPanel(vault.id)
                            }}
                          />
                        ) : null}
                      </View>

                      {currentGeneratedAccess ? (
                        <View style={themed($editorCard)}>
                          <View style={themed($cardHeader)}>
                            <View style={themed($cardTitleBlock)}>
                              <Text style={themed($cardTitle)}>One-time access ready</Text>
                              <Text style={themed($cardSubtitle)}>
                                Share the code or scan from another device before it expires.
                              </Text>
                            </View>
                            <MetaChip themed={themed} label={`Expires ${formatShortDate(currentGeneratedAccess.expiresAt)}`} />
                          </View>

                          <View style={themed($metaGrid)}>
                            <GlassChip themed={themed} label={currentGeneratedAccess.code} selected />
                          </View>

                          {currentGeneratedAccess.qrXml ? (
                            <View style={themed($qrWrap)}>
                              <SvgXml xml={currentGeneratedAccess.qrXml} width={220} height={220} />
                            </View>
                          ) : null}
                        </View>
                      ) : null}

                      {isEditing ? (
                        <View style={themed($editorCard)}>
                          <IconTextInput
                            themed={themed}
                            theme={theme}
                            placeholder="Vault name"
                            value={editingVaultName}
                            onChangeText={setEditingVaultName}
                            icon={<PencilLine size={15} color="rgba(255,255,255,0.75)" />}
                            multiline={false}
                            inputStyle={themed($titleInput)}
                          />

                          <View style={themed($buttonPair)}>
                            <GhostButton
                              themed={themed}
                              label="Cancel"
                              containerStyle={{height: 20, borderRadius: 30}}
                              icon={<Ionicons name="close-outline" size={16} color="#F9E7FF" />}
                              onPress={() => {
                                setEditingVaultId(null)
                                setEditingVaultName("")
                              }}
                            />

                            <GradientPrimaryButton
                              themed={themed}
                              label="Save Name"
                              containerStyle={{height: 40, borderRadius: 30, paddingHorizontal: 20,}}
                              textStyle={{fontSize: 13, fontStyle: typography.primary.normal, marginTop:-10}}
                              icon={<PencilLine size={15} color="#1D0820" />}
                              onPress={() => void handleRenameVault(vault)}
                            />
                          </View>
                        </View>
                      ) : null}

                      {request ? (
                        <View style={themed($inlineCard)}>
                          <Text style={themed($cardTitle)}>Request status</Text>
                          <Text style={themed($cardSubtitle)}>
                            {request.status === "pending"
                              ? "Approval is pending on another linked device."
                              : "Approval is available and will redeem automatically when possible."}
                          </Text>
                          <View style={themed($metaGrid)}>
                            <MetaChip themed={themed} label={request.status === "pending" ? "Pending" : "Approved"} />
                          </View>
                        </View>
                      ) : null}

                      {vaultAccessDevices[vault.id] ? (
                        <View style={themed($deviceList)}>
                          {accessDevices.map((device) => (
                            <View key={device.id} style={themed($deviceRow)}>
                              <View style={themed($deviceMeta)}>
                                <Text style={themed($deviceTitle)}>{device.name}</Text>
                                <View style={themed($deviceChipRow)}>
                                  {device.id === account?.device.id ? <GlassChip themed={themed} label="This device" selected /> : null}
                                  <MetaChip themed={themed} label={`Last active ${formatShortDate(device.lastSeenAt)}`} />
                                </View>
                              </View>

                              {!isPersonal ? (
                                <Pressable
                                  style={themed($revokePill)}
                                  onPress={() => handleRevokeVaultFromDevice(vault, device)}
                                >
                                  <Trash2 size={14} color="#FFB6CA" />
                                  <Text style={themed($revokePillText)}>Revoke</Text>
                                </Pressable>
                              ) : null}
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {!isPersonal && enabled && provisioned ? (
                        <View style={themed($dangerGrid)}>
                          <GhostButton
                            themed={themed}
                            label="Remove From Device"
                            icon={<Ionicons name="remove-circle-outline" size={15} color="#F9E7FF" />}
                            onPress={() => handleRemoveFromDevice(vault)}
                          />
                          <GhostDangerButton
                            themed={themed}
                            label="Delete Vault"
                            icon={<Trash2 size={15} color="#FF9EB7" />}
                            onPress={() => handleDeleteVault(vault)}
                          />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              )
            })}
          </View>
        </GlassSection>

        <GlassSection
          themed={themed}
          title="Devices"
          subtitle="Devices linked to your Locker account."
          icon={<Smartphone size={14} color="#FFC8F3" />}
          rightSlot={
             ( <Pressable onPress={() => setCreatingVault(true)} style={themed($headerActionPill)}>
                <Plus size={14} color="#F8DEFF" />
                <Text style={themed($headerActionText)}>Add Device</Text>
                <Smartphone size={14} color="#FFC8F3" />
              </Pressable>)
          }
        >
          <View style={themed($stack)}>
            {devices.map((device) => (
              <View key={device.id} style={themed($deviceRow)}>
                <View style={themed($deviceMeta)}>
                  <Text style={themed($deviceTitle)}>{device.name}</Text>
                  <View style={themed($deviceChipRow)}>
                    {device.current ? <GlassChip themed={themed} label="Current device" selected /> : null}
                    <MetaChip themed={themed} label={`Last active ${formatShortDate(device.lastSeenAt)}`} />
                  </View>
                </View>

                {!device.current ? (
                  <Pressable style={themed($revokePill)} onPress={() => handleRemoveDevice(device)}>
                    <Trash2 size={14} color="#FFB6CA" />
                    <Text style={themed($revokePillText)}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
             {(
            <View style={themed($heroActionStack)}>
              {/* <GradientPrimaryButton
                themed={themed}
                label="Add Another Device"
                icon={<Plus size={15} color="#1D0820" />}
                onPress={() => navigation.navigate("VaultPairDevice")}
              /> */}
              <GhostButton
                themed={themed}
                label="Refresh"
                icon={<RefreshCw size={15} color="#F9E7FF" />}
                onPress={() => void refresh()}
              />
            </View>
          )}
          </View>

        </GlassSection>
      </ScrollView>
    </Screen>
  )
}

function formatShortDate(value?: string | null) {
  if (!value) return "Unknown"
  return new Date(value).toLocaleString()
}

const $screen: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.xl,
  gap: spacing.md,
})

const $heroCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.sm,
  padding: spacing.sm,
  borderRadius: 24,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.09)",
  gap: spacing.sm,
})

const $heroTopRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
})

const $heroBadge: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  paddingHorizontal: 8,
  paddingVertical: 5,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $heroBadgeText: ThemedStyle<TextStyle> = () => ({
  color: "#F8DFFF",
  fontSize: 10,
  fontWeight: "700",
})

const $heroMetaRow: ThemedStyle<ViewStyle> = () => ({
  alignItems: "flex-end",
})

const $heroTitleRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  
})

const $heroIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 50,
  height: 50,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $heroTextWrap: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $heroTitle: ThemedStyle<TextStyle> = ({typography}) => ({
  color: "#FFF7FF",
  fontFamily: typography.primary.medium,
  fontSize: 25,
  // fontWeight: "700",

})

const $heroSubtitle: ThemedStyle<TextStyle> = () => ({
  marginTop: 4,
  color: "rgba(255,235,255,0.72)",
  fontSize: 12,
  lineHeight: 18,
})

const $heroDetails: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $heroPrimaryAction: ThemedStyle<ViewStyle> = () => ({
  marginTop: 2,
})

const $heroActionStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $errorBanner: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.sm,
  borderRadius: 16,
  backgroundColor: "rgba(255,73,123,0.10)",
  borderWidth: 1,
  borderColor: "rgba(255,115,155,0.18)",
})

const $errorBannerText: ThemedStyle<TextStyle> = () => ({
  flex: 1,
  color: "#FFD0DB",
  fontSize: 12,
  lineHeight: 17,
})

const $statusBanner: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.sm,
  borderRadius: 16,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $statusBannerText: ThemedStyle<TextStyle> = () => ({
  flex: 1,
  color: "#FFF0FF",
  fontSize: 12,
  lineHeight: 17,
})

const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $inlineCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.sm,
  borderRadius: 18,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  gap: spacing.sm,
})

const $cardHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: spacing.sm,
})

const $cardTitleBlock: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $cardTitle: ThemedStyle<TextStyle> = () => ({
  color: "#FFF3FF",
  fontSize: 14,
  fontWeight: "700",
})

const $cardSubtitle: ThemedStyle<TextStyle> = () => ({
  marginTop: 3,
  color: "rgba(255,235,255,0.70)",
  fontSize: 11,
  lineHeight: 16,
})

const $buttonPair: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
})

const $headerActionPill: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $headerActionText: ThemedStyle<TextStyle> = () => ({
  color: "#F6E3FF",
  fontSize: 11,
  fontWeight: "600",
})

const $editorCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.sm,
  borderRadius: 18,
  backgroundColor: "rgba(9,10,15,0.32)",
  // borderWidth: 1,
  // borderColor: "rgba(255,255,255,0.08)",
  gap: spacing.sm,
})

const $titleInput: ThemedStyle<TextStyle> = () => ({
  minHeight: 20,
})

const $vaultCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 20,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  overflow: "hidden",
  gap: spacing.xs,
})

const $vaultHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.sm,
  gap: spacing.sm,
})

const $vaultHeaderTop: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: spacing.sm,
})

const $expandPill: ThemedStyle<ViewStyle> = () => ({
  width: 34,
  height: 34,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $chipRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $metaGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $inlineInfoBanner: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: 14,
  backgroundColor: "rgba(255,73,123,0.08)",
})

const $inlineInfoText: ThemedStyle<TextStyle> = () => ({
  flex: 1,
  color: "#FFD0DB",
  fontSize: 11,
  lineHeight: 16,
})

const $vaultExpanded: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingBottom: spacing.sm,
  gap: spacing.sm,
})

const $actionGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $qrWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingTop: spacing.xs,
})

const $deviceList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $deviceRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: 'flex-end',
  justifyContent: "space-between",
  gap: spacing.sm,
  padding: spacing.sm,
  borderRadius: 18,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $deviceMeta: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  gap: 8,
})

const $deviceTitle: ThemedStyle<TextStyle> = () => ({
  color: "#FFF3FF",
  fontSize: 13,
  fontWeight: "700",
})

const $deviceChipRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $revokePill: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderRadius: 14,
  backgroundColor: "rgba(255,73,123,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,115,155,0.18)",
})

const $revokePillText: ThemedStyle<TextStyle> = () => ({
  color: "#FFC8D5",
  fontSize: 12,
  fontWeight: "700",
})

const $dangerGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
})

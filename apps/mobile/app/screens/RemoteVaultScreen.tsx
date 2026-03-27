import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { DeviceDTO, VaultDTO } from "@locker/types"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { clearVaultAttachmentCache } from "@/locker/attachments/attachmentCache"
import { getAccount } from "@/locker/storage/accountRepo"
import { fetchJson } from "@/locker/net/apiClient"
import { clearRemoteVaultKey, getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { provisionVaultForCurrentUser } from "@/locker/keys/userKeyApi"
import {
  getRemoteVaultId,
  listRemoteVaults,
  setRemoteVaultCatalog,
  setRemoteVaultId,
  setVaultEnabledOnDevice,
} from "@/locker/storage/remoteVaultRepo"
import { requestSync, cancelVault } from "@/locker/sync/syncCoordinator"
import { getSyncStatus } from "@/locker/sync/syncEngine"
import { clearVaultSyncState } from "@/locker/sync/syncStateRepo"
import { removeNotesForVault } from "@/locker/storage/notesRepo"
import { clearSearchIndex } from "@/locker/search/searchRepo"
import { vaultSession } from "@/locker/session"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"

const PERSONAL_VAULT_NAME = "Personal"

export const RemoteVaultScreen: FC<AppStackScreenProps<"RemoteVault">> = function RemoteVaultScreen(props) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [vaults, setVaults] = useState<VaultDTO[]>([])
  const [devices, setDevices] = useState<DeviceDTO[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [account, setAccount] = useState(() => getAccount())
  const [currentVaultId, setCurrentVaultId] = useState<string | null>(() => getRemoteVaultId())
  const [creatingVault, setCreatingVault] = useState(false)
  const [newVaultName, setNewVaultName] = useState("")
  const [vaultKeyPresence, setVaultKeyPresence] = useState<Record<string, boolean>>({})
  const [activeAccessCode, setActiveAccessCode] = useState<{ vaultId: string; code: string; expiresAt: string } | null>(null)
  const [, setRefreshClock] = useState(0)

  const refresh = useCallback(async () => {
    const acct = getAccount()
    setAccount(acct)
    setCurrentVaultId(getRemoteVaultId())
    if (!acct) {
      setVaults([])
      setDevices([])
      return
    }

    setLoading(true)
    try {
      const [vaultData, deviceData] = await Promise.all([
        fetchJson<{ vaults: VaultDTO[] }>("/v1/vaults"),
        fetchJson<{ devices: DeviceDTO[] }>("/v1/devices"),
      ])
      let nextVaults = vaultData.vaults ?? []
      if (nextVaults.length === 0) {
        const created = await fetchJson<{ vault: VaultDTO }>("/v1/vaults", {
          method: "POST",
          body: JSON.stringify({ name: PERSONAL_VAULT_NAME }),
        })
        await provisionVaultForCurrentUser(created.vault.id)
        nextVaults = [created.vault]
      }
      setVaults(nextVaults)
      setDevices(deviceData.devices ?? [])
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

  useEffect(() => {
    const timer = setInterval(() => setRefreshClock((value) => value + 1), 2000)
    return () => clearInterval(timer)
  }, [])

  const currentDevice = useMemo(
    () => devices.find((device) => device.current) ?? devices.find((device) => device.id === account?.device.id) ?? null,
    [account?.device.id, devices],
  )

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

  const handleGenerateVaultAccessCode = useCallback(
    async (vault: VaultDTO) => {
      setError(null)
      setStatus(null)
      try {
        const rvk = await getRemoteVaultKey(vault.id)
        if (!rvk) {
          setError(`${vault.name} is not provisioned on this device yet.`)
          return
        }
        const { buildWrappedVaultKeyPayload, generatePairingCode } = await import("@/locker/pairing/pairingCode")
        const pairingCode = generatePairingCode()
        const wrappedVaultKeyB64 = buildWrappedVaultKeyPayload({ pairingCode, vaultId: vault.id, rvk })
        const data = await fetchJson<{ pairingCode: string; expiresAt: string }>(`/v1/vaults/${vault.id}/pairing-codes`, {
          method: "POST",
          body: JSON.stringify({ pairingCode, wrappedVaultKeyB64 }),
        })
        setActiveAccessCode({ vaultId: vault.id, code: data.pairingCode, expiresAt: data.expiresAt })
        setStatus(`Access code ready for ${vault.name}.`)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create access code")
      }
    },
    [],
  )

  const disableVaultLocally = useCallback(async (vault: VaultDTO) => {
    cancelVault(vault.id)
    await clearRemoteVaultKey(vault.id)
    clearVaultSyncState(vault.id)
    removeNotesForVault(vault.id)
    clearSearchIndex(vault.id)
    await clearVaultAttachmentCache(vault.id)
    setVaultEnabledOnDevice(vault.id, false, { name: vault.name })
    setCurrentVaultId(getRemoteVaultId())
  }, [])

  const handleDisableVault = useCallback(
    (vault: VaultDTO) => {
      if (!account) return
      Alert.alert(
        "Remove from this device",
        `Remove ${vault.name} from this device? Its local key, cached content, and search index will be cleared here.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                await fetchJson(`/v1/devices/${account.device.id}/vaults/${vault.id}`, { method: "DELETE" })
                await disableVaultLocally(vault)
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
    [account, disableVaultLocally, refresh],
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
        setRefreshClock((value) => value + 1)
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

  const handleRequestApproval = useCallback((vault: VaultDTO) => {
    setStatus(`Approval flow is scaffolded for ${vault.name}; use the vault access code path for now.`)
  }, [])

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Vaults & Devices
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Same-user sync across your devices. Each vault keeps its own key and device availability.
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
            <Pressable style={themed($secondaryButton)} onPress={refresh}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Refresh
              </Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Vaults
        </Text>
        <Text style={themed($bodyText)}>
          Personal is created automatically. Use this screen to enable additional vaults on this device or add more vaults to your account.
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
            <Pressable style={themed($secondaryButton)} onPress={() => {
              setCreatingVault(false)
              setNewVaultName("")
            }}>
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

        {activeAccessCode ? (
          <View style={themed($createVaultCard)}>
            <Text preset="bold" style={themed($rowTitle)}>Access code</Text>
            <Text style={themed($metaText)}>{activeAccessCode.code}</Text>
            <Text style={themed($metaText)}>Expires: {new Date(activeAccessCode.expiresAt).toLocaleTimeString()}</Text>
          </View>
        ) : null}

        {vaults.map((vault) => {
          const syncStatus = getSyncStatus(vault.id)
          const enabled = listRemoteVaults().find((item) => item.id === vault.id)?.enabledOnDevice ?? !!vault.enabledOnDevice
          const provisioned = vaultKeyPresence[vault.id] === true
          const isPersonal = vault.name === PERSONAL_VAULT_NAME
          return (
            <View key={vault.id} style={themed($rowCard)}>
              <Text preset="bold" style={themed($rowTitle)}>
                {vault.name}
              </Text>
              <Text style={themed($metaText)}>
                {enabled
                  ? provisioned
                    ? "Available on this device"
                    : "Access code required"
                  : "Not on this device"}
              </Text>
              <Text style={themed($metaText)}>
                Last synced: {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : "Not yet"}
              </Text>
              <Text style={themed($metaText)}>
                {provisioned ? `Queue: ${syncStatus.queueSize}` : "This device does not have the vault key yet"}
              </Text>
              {syncStatus.lastError ? <Text style={themed($errorText)}>{syncStatus.lastError}</Text> : null}
              <View style={themed($buttonRow)}>
                {enabled && provisioned ? (
                  <Pressable style={themed($secondaryButton)} onPress={() => {
                    setRemoteVaultId(vault.id, vault.name)
                    setCurrentVaultId(vault.id)
                  }}>
                    <Text preset="bold" style={themed($secondaryButtonText)}>
                      {currentVaultId === vault.id ? "Current vault" : "Switch to this vault"}
                    </Text>
                  </Pressable>
                ) : null}
                {enabled && provisioned && !isPersonal ? (
                  <Pressable style={themed($secondaryButton)} onPress={() => void handleGenerateVaultAccessCode(vault)}>
                    <Text preset="bold" style={themed($secondaryButtonText)}>
                      Generate access code
                    </Text>
                  </Pressable>
                ) : null}
                {activeAccessCode && activeAccessCode.vaultId === vault.id ? (
                  <View style={themed($createVaultCard)}>
                    <Text preset="bold" style={themed($rowTitle)}>Access code</Text>
                    <Text style={themed($metaText)}>{activeAccessCode.code}</Text>
                    <Text style={themed($metaText)}>Expires: {new Date(activeAccessCode.expiresAt).toLocaleTimeString()}</Text>
                  </View>
                ) : null}
                {enabled && provisioned ? (
                  <Pressable style={themed($secondaryButton)} onPress={() => handleSyncNow(vault.id)}>
                    <Text preset="bold" style={themed($secondaryButtonText)}>
                      Sync now
                    </Text>
                  </Pressable>
                ) : null}
                {!enabled && isPersonal ? (
                  <Text style={themed($metaText)}>Personal is enabled automatically when a device is linked.</Text>
                ) : null}
                {!enabled && !isPersonal ? (
                  <>
                    <Pressable
                      style={themed($secondaryButton)}
                      onPress={() => navigation.navigate("VaultImportPairing", { vaultId: vault.id, vaultName: vault.name })}
                    >
                      <Text preset="bold" style={themed($secondaryButtonText)}>
                        Enter access code
                      </Text>
                    </Pressable>
                    <Pressable style={themed($secondaryButton)} onPress={() => handleRequestApproval(vault)}>
                      <Text preset="bold" style={themed($secondaryButtonText)}>
                        Request approval
                      </Text>
                    </Pressable>
                  </>
                ) : null}
                {enabled && !provisioned && !isPersonal ? (
                  <Pressable
                    style={themed($primaryButton)}
                    onPress={() => navigation.navigate("VaultImportPairing", { vaultId: vault.id, vaultName: vault.name })}
                  >
                    <Text preset="bold" style={themed($primaryButtonText)}>
                      Enter access code
                    </Text>
                  </Pressable>
                ) : null}
                {enabled && provisioned && !isPersonal ? (
                  <Pressable style={themed($secondaryButton)} onPress={() => handleDisableVault(vault)}>
                    <Text preset="bold" style={themed($secondaryButtonText)}>
                      Remove from this device
                    </Text>
                  </Pressable>
                ) : null}
                
              </View>
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

const $bodyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
  lineHeight: 22,
})

const $createVaultCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
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

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
})

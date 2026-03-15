import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { fetchJson, getApiBaseUrl } from "@/locker/net/apiClient"
import { getAccount } from "@/locker/storage/accountRepo"
import {
  clearRemoteVaultId,
  getRemoteVaultId,
  setRemoteVaultId,
} from "@/locker/storage/remoteVaultRepo"
import { getToken } from "@/locker/auth/tokenStore"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { VaultDTO } from "@locker/types"
import { getSyncStatus, setNetworkOnline } from "@/locker/sync/syncEngine"
import { requestSync } from "@/locker/sync/syncCoordinator"
import {
  clearNoteRemoteMeta,
  clearTombstonesForVault,
  getState,
  setLastCursor,
  setOutbox,
} from "@/locker/sync/syncStateRepo"
import { clearRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { listNoteIds } from "@/locker/storage/notesRepo"

const PERSONAL_VAULT_NAME = "Personal Vault"

export const RemoteVaultScreen: FC<AppStackScreenProps<"RemoteVault">> = function RemoteVaultScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [vaultId, setVaultIdState] = useState<string | null>(getRemoteVaultId())
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatus())
  const [offline, setOffline] = useState(false)
  const [remoteVaults, setRemoteVaults] = useState<VaultDTO[]>([])
  const [isLoadingVaults, setIsLoadingVaults] = useState(false)
  const [tokenPresent, setTokenPresent] = useState(false)
  const [account, setAccount] = useState(() => getAccount())

  const apiBaseUrl = getApiBaseUrl()

  const activeVault = useMemo(
    () => remoteVaults.find((vault) => vault.id === vaultId) ?? null,
    [remoteVaults, vaultId],
  )
  const legacyVaultCount = Math.max(remoteVaults.length - (activeVault ? 1 : 0), 0)

  const refreshToken = useCallback(async () => {
    const token = await getToken()
    setTokenPresent(!!token)
  }, [])

  const loadRemoteVaults = useCallback(async () => {
    const acct = getAccount()
    setAccount(acct)
    setVaultIdState(getRemoteVaultId())

    if (!acct) {
      setIsLoadingVaults(false)
      setRemoteVaults([])
      return
    }

    setIsLoadingVaults(true)
    try {
      const data = await fetchJson<{ vaults: VaultDTO[] }>("/v1/vaults")
      const vaults = data.vaults || []
      setRemoteVaults(vaults)

      const storedVaultId = getRemoteVaultId()
      const storedVault = storedVaultId ? vaults.find((vault) => vault.id === storedVaultId) : null
      if (storedVault) {
        setRemoteVaultId(storedVault.id, storedVault.name)
        setVaultIdState(storedVault.id)
        return
      }

      if (vaults.length > 0) {
        const preferred = vaults[0]
        setRemoteVaultId(preferred.id, preferred.name)
        setVaultIdState(preferred.id)
        setStatus("Using the existing personal vault for this account on this device.")
      } else {
        clearRemoteVaultId()
        setVaultIdState(null)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load personal vault"
      setError(message)
    } finally {
      setIsLoadingVaults(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }

      setSyncStatus(getSyncStatus())
      void refreshToken()
      void loadRemoteVaults()
    }, [navigation, refreshToken, loadRemoteVaults]),
  )

  useEffect(() => {
    const timer = setInterval(() => setSyncStatus(getSyncStatus()), 2000)
    return () => clearInterval(timer)
  }, [])

  const handleCreatePersonalVault = async () => {
    setError(null)
    setStatus(null)

    if (!account) {
      setError("Link this device before enabling personal vault sync.")
      return
    }

    if (remoteVaults.length > 0) {
      const preferred = remoteVaults[0]
      setRemoteVaultId(preferred.id, preferred.name)
      setVaultIdState(preferred.id)
      setStatus("Using the existing personal vault on your account.")
      return
    }

    try {
      const data = await fetchJson<{ vault: VaultDTO }>("/v1/vaults", {
        method: "POST",
        body: JSON.stringify({ name: PERSONAL_VAULT_NAME }),
      })
      setRemoteVaultId(data.vault.id, data.vault.name)
      setVaultIdState(data.vault.id)
      setRemoteVaults([data.vault])
      setStatus("Personal vault sync enabled.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create personal vault"
      setError(message)
    }
  }

  const handleSyncNow = async () => {
    setError(null)
    setStatus(null)
    try {
      const result = await requestSync("manual", vaultId ?? undefined)
      if (result?.errors?.length) {
        setStatus(`Sync finished with ${result.errors.length} error(s): ${result.errors[0].type}`)
      } else {
        setStatus(
          `Sync complete: pushed ${result?.pushed ?? 0}, pulled ${result?.pulled ?? 0}, conflicts ${result?.conflicts ?? 0}`,
        )
      }
      setSyncStatus(getSyncStatus())
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed"
      setError(message)
      setSyncStatus(getSyncStatus())
    }
  }

  const toggleOffline = () => {
    const next = !offline
    setOffline(next)
    setNetworkOnline(!next)
  }

  const handleDeleteRemote = () => {
    Alert.alert(
      "Delete Personal Vault",
      "This deletes the synced personal vault and its cloud state. Local encrypted content stays on this device until you remove it separately.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await getToken()
              const activeVaultId = getRemoteVaultId()
              if (!activeVaultId || !token) return

              await fetch(`${apiBaseUrl}/v1/vaults/${activeVaultId}`, {
                method: "DELETE",
                headers: { authorization: `Bearer ${token}` },
              })

              clearRemoteVaultId()
              clearRemoteVaultKey(activeVaultId)
              setLastCursor(0)
              setOutbox([])
              setVaultIdState(null)
              setRemoteVaults([])
              setStatus("Personal vault deleted from the sync service.")
            } catch (err) {
              const message = err instanceof Error ? err.message : "Delete failed"
              setError(message)
            }
          },
        },
      ],
    )
  }

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Sync Setup
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          One personal vault, encrypted before sync.
        </Text>
      </View>

      <View style={themed($card)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Connection
        </Text>
        <Text style={themed($metaText)}>API Base: {apiBaseUrl}</Text>
        <Text style={themed($metaText)}>Token: {tokenPresent ? "present" : "missing"}</Text>
        <Text style={themed($metaText)}>Device ID: {account?.device.id ?? "n/a"}</Text>
        <Text style={themed($metaText)}>User: {account?.user.email ?? account?.user.id ?? "n/a"}</Text>
        <Text style={themed($metaText)}>Personal Vault ID: {vaultId ?? "not configured"}</Text>

        {!account ? (
          <Pressable style={themed($primaryButton)} onPress={() => navigation.navigate("VaultLinkDevice")}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              Link This Device
            </Text>
          </Pressable>
        ) : null}

        <Pressable style={themed($secondaryButton)} onPress={loadRemoteVaults}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Refresh Sync State
          </Text>
        </Pressable>
      </View>

      {account ? (
        <View style={themed($card)}>
          <Text preset="bold" style={themed($sectionTitle)}>
            Personal Vault
          </Text>
          {isLoadingVaults ? <Text style={themed($metaText)}>Loading cloud vault state…</Text> : null}
          {activeVault ? (
            <>
              <Text style={themed($bodyText)}>
                Sync is connected to {activeVault.name}. This is the only vault exposed in the active mobile flow.
              </Text>
              <Text style={themed($metaText)}>Vault ID: {activeVault.id}</Text>
            </>
          ) : (
            <Text style={themed($bodyText)}>
              No personal vault is configured yet. Create one to enable encrypted sync for this device.
            </Text>
          )}

          <Pressable style={themed($primaryButton)} onPress={handleCreatePersonalVault}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              {activeVault ? "Use Existing Personal Vault" : "Create Personal Vault"}
            </Text>
          </Pressable>

          {legacyVaultCount > 0 ? (
            <View style={themed($warningCard)}>
              <Text preset="bold" style={themed($warningTitle)}>
                Legacy Vaults Detected
              </Text>
              <Text style={themed($warningText)}>
                This account still has {legacyVaultCount} additional vault{legacyVaultCount === 1 ? "" : "s"} from older flows. They remain untouched, but switching between vaults is no longer exposed in the current app.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {account && vaultId ? (
        <View style={themed($card)}>
          <Text preset="bold" style={themed($sectionTitle)}>
            Sync Status
          </Text>
          <Text style={themed($metaText)}>State: {syncStatus.state}</Text>
          <Text style={themed($metaText)}>Queue: {syncStatus.queueSize}</Text>
          {syncStatus.lastSyncAt ? (
            <Text style={themed($metaText)}>Last sync: {new Date(syncStatus.lastSyncAt).toLocaleString()}</Text>
          ) : null}
          {syncStatus.lastError ? <Text style={themed($errorText)}>{syncStatus.lastError}</Text> : null}

          <Pressable style={themed($primaryButton)} onPress={handleSyncNow}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              Sync Now
            </Text>
          </Pressable>

          <Pressable
            style={themed($secondaryButton)}
            onPress={() => navigation.navigate("VaultTabs", { screen: "Vault", params: { screen: "VaultNote" } })}
          >
            <Text preset="bold" style={themed($secondaryButtonText)}>
              New Secure Note
            </Text>
          </Pressable>

          <Pressable style={themed($secondaryButton)} onPress={() => navigation.navigate("VaultPairDevice")}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Show Pairing QR
            </Text>
          </Pressable>

          <Pressable style={themed($secondaryButton)} onPress={() => navigation.navigate("VaultImportPairing")}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Import Pairing
            </Text>
          </Pressable>

          <Pressable style={themed($dangerButton)} onPress={handleDeleteRemote}>
            <Text preset="bold" style={themed($dangerButtonText)}>
              Delete Personal Vault
            </Text>
          </Pressable>

          {__DEV__ ? (
            <Pressable style={themed($secondaryButton)} onPress={toggleOffline}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                {offline ? "Go Online" : "Toggle Offline"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {__DEV__ && account && vaultId ? (
        <View style={themed($card)}>
          <Text preset="bold" style={themed($sectionTitle)}>
            Dev Diagnostics
          </Text>
          <Text style={themed($metaText)}>Last cursor: {getState().lastCursor}</Text>
          <Text style={themed($metaText)}>Queue size: {getState().outbox.length}</Text>
          <Text style={themed($metaText)}>Last sync: {getState().lastSyncAt ?? "n/a"}</Text>
          <Text style={themed($metaText)}>Last sync duration: {getState().lastSyncDurationMs ?? 0} ms</Text>
          <Text style={themed($metaText)}>Changes processed: {getState().lastChangesProcessed ?? 0}</Text>
          <Text style={themed($metaText)}>Index size: {getState().lastIndexSize ?? 0}</Text>
          <Text style={themed($metaText)}>Tombstones: {getState().lastTombstonesCount ?? 0}</Text>
          <Text style={themed($metaText)}>Lamport clock: {getState().lamportClock}</Text>
          <Pressable
            style={themed($secondaryButton)}
            onPress={async () => {
              listNoteIds(vaultId).forEach((id) => clearNoteRemoteMeta(id))
              clearTombstonesForVault(vaultId)
              setLastCursor(0)
              setOutbox([])
              await handleSyncNow()
            }}
          >
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Force Full Rebuild
            </Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}
      {status ? <Text style={themed($statusText)}>{status}</Text> : null}

      <Pressable style={themed($linkButton)} onPress={() => navigation.goBack()}>
        <Text preset="bold" style={themed($linkText)}>
          Back
        </Text>
      </Pressable>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral900,
  paddingHorizontal: spacing.xl,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.xl,
  marginBottom: spacing.lg,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.neutral800,
  borderRadius: 16,
  padding: spacing.lg,
  marginBottom: spacing.md,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.12)",
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral100,
  marginBottom: spacing.sm,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 12,
  marginBottom: 6,
})

const $bodyText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral200,
  lineHeight: 22,
  marginBottom: spacing.sm,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginTop: spacing.sm,
  marginBottom: spacing.sm,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.sm,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $dangerButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 90, 90, 0.15)",
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255, 90, 90, 0.4)",
  marginBottom: spacing.sm,
})

const $dangerButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
})

const $warningCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 196, 61, 0.12)",
  borderRadius: 14,
  padding: spacing.md,
  borderWidth: 1,
  borderColor: "rgba(255, 196, 61, 0.26)",
  marginTop: spacing.sm,
})

const $warningTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral100,
  marginBottom: spacing.xs,
})

const $warningText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  lineHeight: 20,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.sm,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.success500,
  marginBottom: spacing.sm,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

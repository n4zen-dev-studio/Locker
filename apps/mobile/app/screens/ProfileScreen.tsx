import { FC, useCallback, useState } from "react"
import { Alert, Platform, Pressable, Share, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { GlassCard } from "@/components/GlassCard"
import { GlassHeader } from "@/components/GlassHeader"
import { AnimatedBlobBackground } from "@/components/AnimatedBlobBackground"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { clearToken, getToken } from "@/locker/auth/tokenStore"
import { AccountState, clearAccount, getAccount } from "@/locker/storage/accountRepo"
import { clearRemoteVaultId, getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { cancelVault } from "@/locker/sync/syncCoordinator"
import { normalizeApiBaseUrl, fetchJson } from "@/locker/net/apiClient"
import { getServerUrl, setServerUrl, clearServerUrl } from "@/locker/storage/serverConfigRepo"
import { buildDiagnosticsSnapshot, exportDiagnosticsJson, exportEncryptedVaultBackup } from "@/locker/diagnostics/diagnostics"
import { rebuildSearchIndex } from "@/locker/search/searchRepo"
import { setNetworkOnline } from "@/locker/sync/syncEngine"
import { clearNoteRemoteMeta, clearTombstonesForVault, setLastCursor, setOutbox } from "@/locker/sync/syncStateRepo"
import { listNoteIds } from "@/locker/storage/notesRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { Button } from "@/components/Button"

export const ProfileScreen: FC<AppStackScreenProps<"Profile">> = function ProfileScreen(props) {
  const { navigation } = props
  const { themed, toggleTheme } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [account, setAccount] = useState<AccountState | null>(null)
  const [token, setTokenState] = useState<string | null>(null)
  const [apiUrlInput, setApiUrlInput] = useState("")
  const [apiUrlStatus, setApiUrlStatus] = useState<string | null>(null)
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof buildDiagnosticsSnapshot>> | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  const refresh = useCallback(async () => {
    const storedToken = await getToken()
    setTokenState(storedToken)
    setAccount(getAccount())
    const storedUrl = getServerUrl()
    if (storedUrl) {
      setApiUrlInput(storedUrl)
    } else {
      const platformDefault = Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000"
      setApiUrlInput(platformDefault)
    }
    const next = await buildDiagnosticsSnapshot()
    setSnapshot(next)
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

  const handleDisconnect = () => {
    Alert.alert("Disconnect", "Remove this device from your Locker account?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: async () => {
          const activeVault = getRemoteVaultId()
          if (activeVault) cancelVault(activeVault)
          await clearToken()
          clearAccount()
          clearRemoteVaultId()
          setTokenState(null)
          setAccount(null)
        },
      },
    ])
  }

  const handleSaveApiUrl = () => {
    const normalized = normalizeApiBaseUrl(apiUrlInput)
    setServerUrl(normalized)
    setApiUrlStatus(`Saved: ${normalized}`)
  }

  const handleResetApiUrl = () => {
    clearServerUrl()
    const platformDefault = Platform.OS === "android" ? "http://10.0.2.2:4000" : "http://localhost:4000"
    setApiUrlInput(platformDefault)
    setApiUrlStatus(`Reset to: ${platformDefault}`)
  }

  const handlePing = async () => {
    setError(null)
    setStatus(null)
    const normalized = normalizeApiBaseUrl(apiUrlInput)
    try {
      const data = await fetchJson<{ ok?: boolean }>("/health", {}, { baseUrl: normalized, token: null })
      setStatus(`Ping ok: ${JSON.stringify(data)}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ping failed"
      setError(message)
    }
  }

  const handleExport = async () => {
    setError(null)
    setStatus(null)
    try {
      const text = await exportDiagnosticsJson()
      await Share.share({ message: text })
      setStatus("Diagnostics exported.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed"
      setError(message)
    }
  }

  const handleExportBackup = async () => {
    setError(null)
    setStatus(null)
    try {
      const text = exportEncryptedVaultBackup()
      await Share.share({ message: text })
      setStatus("Encrypted backup exported.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed"
      setError(message)
    }
  }

  const handleRebuildSearch = () => {
    setError(null)
    setStatus(null)
    try {
      rebuildSearchIndex(snapshot?.vaultId ?? null)
      setStatus("Search index rebuilt.")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Rebuild failed"
      setError(message)
    }
  }

  const toggleOffline = () => {
    const next = !offline
    setOffline(next)
    setNetworkOnline(!next)
  }

  const handleClearSyncState = () => {
    const vaultId = getRemoteVaultId()
    if (!vaultId) return
    setLastCursor(0)
    setOutbox([])
    clearTombstonesForVault(vaultId)
    listNoteIds(vaultId).forEach((id) => clearNoteRemoteMeta(id))
    setStatus("Local sync state cleared")
  }

  const connected = !!token && !!account

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <AnimatedBlobBackground>
        <View style={themed($headerWrap)}>
          <GlassHeader>
            <Text preset="heading" style={themed($title)}>
              Profile
            </Text>
            <Text preset="subheading" style={themed($subtitle)}>
              Account, server, diagnostics
            </Text>
          </GlassHeader>
        </View>
         <View>
        <Button tx="welcomeScreen:SwitchTheme" onPress={toggleTheme} />
      </View>

        <View style={themed($content)}>
          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Account
            </Text>
            <Text style={themed($metaText)}>Status: {connected ? "Connected" : "Not connected"}</Text>
            {connected ? (
              <View style={themed($detailGroup)}>
                <Text style={themed($metaText)}>User: {account?.user.email ?? account?.user.id}</Text>
                <Text style={themed($metaText)}>Device: {account?.device.name}</Text>
                <Text style={themed($metaText)}>API Base: {account?.apiBase}</Text>
              </View>
            ) : (
              <Text style={themed($metaText)}>Link this device to access remote vault sync.</Text>
            )}
            <Pressable style={themed($primaryButton)} onPress={() => navigation.navigate("VaultLinkDevice")}>
              <Text preset="bold" style={themed($primaryButtonText)}>
                Link Device (Scan QR)
              </Text>
            </Pressable>
            {connected ? (
              <Pressable style={themed($secondaryButton)} onPress={handleDisconnect}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Disconnect
                </Text>
              </Pressable>
            ) : null}
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Server URL
            </Text>
            <TextInput
              value={apiUrlInput}
              onChangeText={setApiUrlInput}
              placeholder="http://192.168.0.10:4000"
              placeholderTextColor="#9aa0a6"
              style={themed($input)}
            />
            {apiUrlStatus ? <Text style={themed($metaText)}>{apiUrlStatus}</Text> : null}
            <Pressable style={themed($primaryButton)} onPress={handleSaveApiUrl}>
              <Text preset="bold" style={themed($primaryButtonText)}>
                Save Server URL
              </Text>
            </Pressable>
            <Pressable style={themed($secondaryButton)} onPress={handlePing}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Ping Server
              </Text>
            </Pressable>
            <Pressable style={themed($secondaryButton)} onPress={handleResetApiUrl}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Reset to Default
              </Text>
            </Pressable>
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Diagnostics
            </Text>
            <Text style={themed($metaText)}>Vault ID: {snapshot?.vaultId ?? "n/a"}</Text>
            <Text style={themed($metaText)}>Device ID: {snapshot?.deviceId ?? "n/a"}</Text>
            <Text style={themed($metaText)}>User ID: {snapshot?.userId ?? "n/a"}</Text>
            <Text style={themed($metaText)}>Token Present: {snapshot?.tokenPresent ? "yes" : "no"}</Text>
            <Pressable style={themed($secondaryButton)} onPress={refresh}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Refresh Snapshot
              </Text>
            </Pressable>
            <Pressable style={themed($primaryButton)} onPress={handleExport}>
              <Text preset="bold" style={themed($primaryButtonText)}>
                Export Diagnostics
              </Text>
            </Pressable>
            {__DEV__ ? (
              <Pressable style={themed($secondaryButton)} onPress={handleExportBackup}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Export Encrypted Backup
                </Text>
              </Pressable>
            ) : null}
            {__DEV__ ? (
              <Pressable style={themed($secondaryButton)} onPress={handleRebuildSearch}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Rebuild Search Index
                </Text>
              </Pressable>
            ) : null}
          </GlassCard>

          {__DEV__ ? (
            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Dev Tools
              </Text>
              <Pressable style={themed($secondaryButton)} onPress={toggleOffline}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  {offline ? "Go Online" : "Toggle Offline"}
                </Text>
              </Pressable>
              <Pressable style={themed($secondaryButton)} onPress={handleClearSyncState}>
                <Text preset="bold" style={themed($secondaryButtonText)}>
                  Clear Sync State
                </Text>
              </Pressable>
            </GlassCard>
          ) : null}

          {error ? <Text style={themed($errorText)}>{error}</Text> : null}
          {status ? <Text style={themed($statusText)}>{status}</Text> : null}
        </View>
      </AnimatedBlobBackground>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
})

const $headerWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
  marginBottom: spacing.md,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
  gap: spacing.lg,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textStrong,
  marginBottom: spacing.sm,
})

const $detailGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  marginBottom: spacing.sm,
})

const $input: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 14,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  color: colors.textStrong,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  marginBottom: spacing.md,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.accentPink,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginBottom: spacing.md,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: colors.glassBorder,
  marginBottom: spacing.md,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  fontSize: 12,
  marginBottom: 6,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.sm,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  marginBottom: spacing.sm,
})

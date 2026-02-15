import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { AppState, Pressable, ScrollView, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { listNotesForVault, Note } from "@/locker/storage/notesRepo"
import { getMeta } from "@/locker/storage/vaultMetaRepo"
import { disablePasskeyDevOnly, isPasskeyEnabled } from "@/locker/auth/passkey"
import { getRemoteVaultId, getRemoteVaultName } from "@/locker/storage/remoteVaultRepo"
import { getSyncStatus, syncNow } from "@/locker/sync/syncEngine"
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { getToken } from "@/locker/auth/tokenStore"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultHomeScreen: FC<AppStackScreenProps<"VaultHome">> = function VaultHomeScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [notes, setNotes] = useState<Note[]>([])
  const [localNotes, setLocalNotes] = useState<Note[]>([])
  const [error, setError] = useState<string | null>(null)
  const [unlockMethod, setUnlockMethod] = useState<string | null>(null)
  const [metaVersion, setMetaVersion] = useState<1 | 2 | null>(null)
  const [syncStatus, setSyncStatus] = useState(() => getSyncStatus())
  const [tokenPresent, setTokenPresent] = useState(false)
  const [rvkPresent, setRvkPresent] = useState(false)

  const activeVaultId = getRemoteVaultId()
  const activeVaultName = getRemoteVaultName()

  const refreshNotes = useCallback(() => {
    const key = vaultSession.getKey()
    if (!key) return
    try {
      setNotes(listNotesForVault(key, activeVaultId ?? null))
      setLocalNotes(listNotesForVault(key, null))
      setError(null)
    } catch {
      setError("Vault data error")
    }
  }, [activeVaultId])

  const refreshMeta = useCallback(async () => {
    const meta = getMeta()
    setMetaVersion(meta ? meta.v : null)
    if (meta?.v === 2 && (await isPasskeyEnabled())) {
      setUnlockMethod("Passkey")
    } else if (meta?.v === 1) {
      setUnlockMethod("Legacy PIN")
    } else {
      setUnlockMethod(null)
    }
  }, [])

  const refreshSyncPrereqs = useCallback(async () => {
    const token = await getToken()
    setTokenPresent(!!token)
    if (!activeVaultId) {
      setRvkPresent(false)
      return
    }
    const rvk = await getRemoteVaultKey(activeVaultId)
    setRvkPresent(!!rvk)
  }, [activeVaultId])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      refreshNotes()
      refreshMeta()
      refreshSyncPrereqs().catch(() => undefined)
    }, [navigation, refreshNotes, refreshMeta, refreshSyncPrereqs]),
  )

  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active" && !vaultSession.isUnlocked()) {
          navigation.replace("VaultLocked")
        }
      })
      return () => sub.remove()
    }, [navigation]),
  )

  useEffect(() => {
    refreshMeta().catch(() => undefined)
  }, [refreshMeta])

  useEffect(() => {
    const timer = setInterval(() => {
      setSyncStatus(getSyncStatus())
    }, 2000)
    return () => clearInterval(timer)
  }, [])

  const syncReason = useMemo(() => {
    if (!activeVaultId) return "Select a remote vault"
    if (!tokenPresent) return "Link device"
    if (!vaultSession.isUnlocked()) return "Unlock vault"
    if (!rvkPresent) return "Create sync key"
    return null
  }, [activeVaultId, tokenPresent, rvkPresent])

  const handleSyncNow = async () => {
    if (syncReason) return
    try {
      await syncNow()
      setSyncStatus(getSyncStatus())
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed"
      setError(message)
      setSyncStatus(getSyncStatus())
    }
  }

  const handleLock = () => {
    vaultSession.clear()
    navigation.popToTop()
    navigation.replace("Calculator")
  }

  const handleDisablePasskey = async () => {
    await disablePasskeyDevOnly()
    refreshMeta().catch(() => undefined)
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          {activeVaultName ?? "Locker"}
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          {activeVaultId ? "Remote Vault" : "Local Vault"}
        </Text>
        {unlockMethod ? (
          <Text style={themed($metaText)}>Unlock method: {unlockMethod}</Text>
        ) : null}
        <Text style={themed($metaText)}>Sync: {syncStatus.state} · Queue {syncStatus.queueSize}</Text>
        {__DEV__ && metaVersion ? (
          <Text style={themed($metaText)}>Meta version: v{metaVersion}</Text>
        ) : null}
      </View>

      <View style={themed($actionsRow)}>
        <Pressable style={themed($primaryButton)} onPress={() => navigation.navigate("VaultNote", {})}>
          <Text preset="bold" style={themed($primaryButtonText)}>
            New Secure Note
          </Text>
        </Pressable>
        <Pressable style={themed($secondaryButton)} onPress={() => navigation.navigate("VaultSwitcher")}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Switch Vault
          </Text>
        </Pressable>
        <Pressable style={themed($secondaryButton)} onPress={() => navigation.navigate("VaultSettings")}>
          <Text preset="bold" style={themed($secondaryButtonText)}>
            Settings
          </Text>
        </Pressable>
      </View>

      <View style={themed($syncRow)}>
        <Pressable
          style={[themed($syncButton), syncReason ? themed($buttonDisabled) : null]}
          onPress={handleSyncNow}
        >
          <Text preset="bold" style={themed($syncButtonText)}>
            Sync Now
          </Text>
        </Pressable>
        {syncReason ? <Text style={themed($metaText)}>{syncReason}</Text> : null}
      </View>

      {error ? (
        <View style={themed($errorCard)}>
          <Text style={themed($errorText)}>{error}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={themed($list)}>
        <Text preset="bold" style={themed($sectionTitle)}>
          Notes
        </Text>
        {notes.length === 0 ? (
          <View style={themed($emptyCard)}>
            <Text style={themed($emptyText)}>No notes in this vault yet.</Text>
          </View>
        ) : (
          notes.map((note) => (
            <Pressable
              key={note.id}
              style={({ pressed }) => [themed($noteCard), pressed && themed($notePressed)]}
              onPress={() => navigation.navigate("VaultNote", { noteId: note.id })}
            >
              <Text preset="bold" style={themed($noteTitle)} numberOfLines={1}>
                {note.title || "Untitled"}
              </Text>
              <Text style={themed($noteMeta)}>{new Date(note.updatedAt).toLocaleString()}</Text>
            </Pressable>
          ))
        )}

        {localNotes.length > 0 ? (
          <View style={themed($section)}>
            <Text preset="bold" style={themed($sectionTitle)}>
              Local Only
            </Text>
            {localNotes.map((note) => (
              <Pressable
                key={note.id}
                style={({ pressed }) => [themed($noteCard), pressed && themed($notePressed)]}
                onPress={() => navigation.navigate("VaultNote", { noteId: note.id })}
              >
                <Text preset="bold" style={themed($noteTitle)} numberOfLines={1}>
                  {note.title || "Untitled"}
                </Text>
                <Text style={themed($noteMeta)}>{new Date(note.updatedAt).toLocaleString()}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {__DEV__ && metaVersion === 2 ? (
        <Pressable style={themed($devButton)} onPress={handleDisablePasskey}>
          <Text preset="bold" style={themed($devText)}>
            Disable Passkey (Dev)
          </Text>
        </Pressable>
      ) : null}

      <Pressable style={themed($lockButton)} onPress={handleLock}>
        <Text preset="bold" style={themed($lockText)}>
          Lock Vault
        </Text>
      </Pressable>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.palette.neutral900,
  paddingHorizontal: spacing.xl,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.xl,
  marginBottom: spacing.md,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
  marginTop: 6,
  fontSize: 12,
})

const $actionsRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  marginBottom: spacing.lg,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 16,
  paddingVertical: spacing.md,
  alignItems: "center",
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 16,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $syncRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.md,
})

const $syncButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.secondary300,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
})

const $syncButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $buttonDisabled: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.5,
})

const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.xl,
  gap: spacing.md,
})

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.lg,
  gap: spacing.md,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
  marginBottom: 4,
})

const $noteCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 18,
  padding: spacing.md,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.1)",
})

const $notePressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.8,
})

const $noteTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  marginBottom: 4,
})

const $noteMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
  fontSize: 12,
})

const $emptyCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  borderRadius: 18,
  padding: spacing.lg,
  alignItems: "center",
})

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

const $devButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingVertical: spacing.sm,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.2)",
  marginBottom: spacing.sm,
})

const $devText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
})

const $lockButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  marginTop: spacing.md,
  marginBottom: spacing.lg,
  alignItems: "center",
  paddingVertical: spacing.sm,
  borderRadius: 12,
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
})

const $lockText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
})

const $errorCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(192, 52, 3, 0.25)",
  borderRadius: 16,
  padding: spacing.md,
  marginBottom: spacing.md,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

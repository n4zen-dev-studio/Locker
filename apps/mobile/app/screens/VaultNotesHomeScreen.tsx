import { FC, useCallback, useEffect, useMemo, useState } from "react"
import {
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Icon } from "@/components/Icon"
import { GlassHeader } from "@/components/GlassHeader"
import { GlassPillButton } from "@/components/GlassPillButton"
import { AccentBadge } from "@/components/AccentBadge"
import { AnimatedBlobBackground } from "@/components/AnimatedBlobBackground"
import type { VaultStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { listNotesForVault, Note } from "@/locker/storage/notesRepo"
import { getMeta } from "@/locker/storage/vaultMetaRepo"
import { disablePasskeyDevOnly, isPasskeyEnabled } from "@/locker/auth/passkey"
import { getRemoteVaultId, getRemoteVaultName } from "@/locker/storage/remoteVaultRepo"
import { getSyncStatus } from "@/locker/sync/syncEngine"
import { requestSync } from "@/locker/sync/syncCoordinator"
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { getToken } from "@/locker/auth/tokenStore"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { ensureUserKeypairUploaded } from "@/locker/keys/userKeyApi"

export const VaultNotesHomeScreen: FC<VaultStackScreenProps<"VaultHome">> = function VaultNotesHomeScreen(
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
  const [refreshing, setRefreshing] = useState(false)
  const unlocked = vaultSession.isUnlocked()

  const [activeVaultId, setActiveVaultId] = useState<string | null>(() => getRemoteVaultId())
  const [activeVaultName, setActiveVaultName] = useState<string | null>(() => getRemoteVaultName())

  const refreshActiveVault = useCallback(() => {
    setActiveVaultId(getRemoteVaultId())
    setActiveVaultName(getRemoteVaultName())
  }, [])

  const refreshNotes = useCallback(() => {
    if (!vaultSession.isUnlocked()) {
      return
    }

    const key = vaultSession.getKey()
    if (!key) return

    try {
      const vaultNotes = listNotesForVault(key, activeVaultId ?? null)
      const localOnly = listNotesForVault(key, null)
      setNotes(vaultNotes)
      setLocalNotes(localOnly)
      setError(null)
    } catch (e) {
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
      refreshActiveVault()
      refreshNotes()
      refreshMeta()
      refreshSyncPrereqs().catch(() => undefined)
      ensureUserKeypairUploaded().catch(() => undefined)
    }, [navigation, refreshNotes, refreshMeta, refreshSyncPrereqs, refreshActiveVault]),
  )

  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active" && !vaultSession.isUnlocked()) {
          navigation.replace("VaultLocked")
        }
      })
      refreshActiveVault()
      refreshNotes()
      refreshSyncPrereqs().catch(() => undefined)
      return () => sub.remove()
    }, [navigation, refreshActiveVault, refreshNotes, refreshSyncPrereqs]),
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
    if (!unlocked) return "Unlock vault"
    if (!rvkPresent) return "Create sync key"
    return null
  }, [activeVaultId, tokenPresent, rvkPresent, unlocked])

  const handleSyncNow = async () => {
    if (syncReason) return
    setError(null)
    setRefreshing(true)
    try {
      const result = await requestSync("manual", activeVaultId ?? undefined)
      if (result?.errors?.length > 0) {
        setError(`Sync completed with ${result.errors.length} error(s): ${result.errors[0].type}`)
      }
      refreshNotes()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed"
      setError(message)
    } finally {
      setRefreshing(false)
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
      <AnimatedBlobBackground>
        <View style={themed($headerWrap)}>
          <GlassHeader>
            <View style={themed($headerRow)}>
              <GlassPillButton
                label={activeVaultName ?? "Local Vault"}
                onPress={() => navigation.navigate("VaultSwitcherModal")}
              />
              <View style={themed($headerActions)}>
                <Pressable onPress={() => navigation.navigate("VaultTabs", { screen: "Sync" })}>
                  <AccentBadge label="Sync" tone="blue" />
                </Pressable>
                <Pressable onPress={() => navigation.navigate("VaultTabs", { screen: "Collab" })}>
                  <AccentBadge label="Members" tone="yellow" />
                </Pressable>
                <Pressable onPress={() => navigation.navigate("Profile")}>
                  <View style={themed($avatar)}>
                    <Text preset="bold" style={themed($avatarText)}>
                      P
                    </Text>
                  </View>
                </Pressable>
                <Pressable onPress={handleLock} style={themed($lockButton)}>
                  <Icon icon="lock" size={16} color="#fff" />
                </Pressable>
              </View>
            </View>
            <Text preset="heading" style={themed($title)}>
              {activeVaultName ?? "Locker"}
            </Text>
            <Text preset="subheading" style={themed($subtitle)}>
              {activeVaultId ? "Remote Vault" : "Local Vault"}
            </Text>
            {unlockMethod ? <Text style={themed($metaText)}>Unlock method: {unlockMethod}</Text> : null}
            <Text style={themed($metaText)}>
              Sync: {syncStatus.state} · Queue {syncStatus.queueSize}
            </Text>
            {__DEV__ && metaVersion ? (
              <Text style={themed($metaText)}>Meta version: v{metaVersion}</Text>
            ) : null}
          </GlassHeader>
        </View>

        <ScrollView
          contentContainerStyle={themed($content)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleSyncNow} />}
        >
          <Pressable style={themed($searchButton)} onPress={() => navigation.navigate("VaultSearch")}>
            <Text style={themed($searchText)}>Search notes…</Text>
          </Pressable>

          {syncReason ? (
            <View style={themed($syncHint)}>
              <Text style={themed($metaText)}>Sync disabled: {syncReason}</Text>
            </View>
          ) : null}

          {error ? (
            <View style={themed($errorCard)}>
              <Text style={themed($errorText)}>{error}</Text>
            </View>
          ) : null}

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

          {__DEV__ && metaVersion === 2 ? (
            <Pressable style={themed($devButton)} onPress={handleDisablePasskey}>
              <Text preset="bold" style={themed($devText)}>
                Disable Passkey (Dev)
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </AnimatedBlobBackground>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $headerWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
})

const $headerRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: spacing.md,
  gap: spacing.sm,
})

const $headerActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $avatar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: colors.glassHeavy,
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $avatarText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
  fontSize: 12,
})

const $lockButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 32,
  height: 32,
  borderRadius: 16,
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  marginTop: 6,
  fontSize: 12,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
  gap: spacing.md,
})

const $searchButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 16,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.md,
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $searchText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $syncHint: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.sm,
})

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.lg,
  gap: spacing.md,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
  marginBottom: 4,
})

const $noteCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 18,
  padding: spacing.md,
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $notePressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.8,
})

const $noteTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
  marginBottom: 4,
})

const $noteMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  fontSize: 12,
})

const $emptyCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 18,
  padding: spacing.lg,
  alignItems: "center",
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $devButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  paddingVertical: spacing.sm,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  marginBottom: spacing.sm,
})

const $devText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $errorCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(192, 52, 3, 0.25)",
  borderRadius: 16,
  padding: spacing.md,
  marginBottom: spacing.md,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

import { FC, useCallback, useEffect, useMemo, useState } from "react"
import {
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Icon } from "@/components/Icon"
import { GlassHeader } from "@/components/GlassHeader"
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
import {
  getVaultItemTypeFromMime,
  isSensitiveClassification,
  VaultClassification,
} from "@/locker/vault/types"

type VaultFilter = "all" | "notes" | "images" | "pdfs" | "files" | "sensitive" | "recent" | "deleted"
type VaultSort = "updated" | "created" | "title" | "classification"

export const VaultNotesHomeScreen: FC<VaultStackScreenProps<"VaultHome">> = function VaultNotesHomeScreen(
  props,
) {
  const { navigation } = props
  const { themed, theme } = useAppTheme()
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
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<VaultFilter>("all")
  const [sort, setSort] = useState<VaultSort>("updated")
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

  const items = useMemo(() => {
    const noteMap = new Map<string, Note>()
    ;[...notes, ...localNotes].forEach((note) => noteMap.set(note.id, note))

    const list: VaultListItem[] = []
    for (const note of noteMap.values()) {
      const syncStatus = note.vaultId ? "cloud" : "local"
      list.push({
        id: `note:${note.id}`,
        noteId: note.id,
        type: "note",
        title: note.title || "Untitled",
        preview: note.body,
        updatedAt: note.updatedAt,
        createdAt: note.createdAt,
        classification: note.classification,
        deleted: !!note.deletedAt,
        syncStatus,
      })

      for (const attachment of note.attachments ?? []) {
        list.push({
          id: `attachment:${attachment.id}`,
          noteId: note.id,
          attachmentId: attachment.id,
          type: getVaultItemTypeFromMime(attachment.mime),
          title: attachment.filename ?? "Attachment",
          preview: attachment.mime,
          updatedAt: note.updatedAt,
          createdAt: attachment.createdAt,
          classification: note.classification,
          deleted: !!note.deletedAt,
          syncStatus,
        })
      }
    }

    return list
  }, [localNotes, notes])

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return items
      .filter((item) => {
        if (filter === "deleted") return item.deleted
        if (item.deleted) return false
        if (filter === "notes") return item.type === "note"
        if (filter === "images") return item.type === "image"
        if (filter === "pdfs") return item.type === "pdf"
        if (filter === "files") return item.type === "file"
        if (filter === "sensitive") return isSensitiveClassification(item.classification)
        if (filter === "recent") return Date.now() - new Date(item.updatedAt).getTime() <= RECENT_WINDOW_MS
        return true
      })
      .filter((item) => {
        if (!normalizedQuery) return true
        const haystack = [
          item.title,
          item.preview,
          item.classification,
          item.type,
          item.syncStatus,
        ]
          .join(" ")
          .toLowerCase()
        return haystack.includes(normalizedQuery)
      })
      .sort((a, b) => compareVaultItems(a, b, sort))
  }, [filter, items, query, sort])

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <AnimatedBlobBackground>
        <View style={themed($headerWrap)}>
          <GlassHeader>
            <View style={themed($headerRow)}>
              <View>
                <Text preset="bold" style={themed($vaultNameText)}>
                  {activeVaultName ?? "Personal Vault"}
                </Text>
                <Text style={themed($metaText)}>
                  {activeVaultId ? "Personal cloud vault" : "Local-only vault"}
                </Text>
              </View>
              <View style={themed($headerActions)}>
                <Pressable onPress={() => navigation.navigate("VaultTabs", { screen: "Security" })}>
                  <AccentBadge label="Security" tone="blue" />
                </Pressable>
                <Pressable onPress={() => navigation.navigate("VaultTabs", { screen: "Settings" })}>
                  <AccentBadge label="Settings" tone="yellow" />
                </Pressable>
                <Pressable onPress={handleLock} style={themed($lockButton)}>
                  <Icon icon="lock" size={16} color="#fff" />
                </Pressable>
              </View>
            </View>
            <Text preset="heading" style={themed($title)}>
              Vault
            </Text>
            <Text preset="subheading" style={themed($subtitle)}>
              Unified encrypted notes and attachments
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
          <View style={themed($quickActionsRow)}>
            <QuickAction label="New Note" onPress={() => navigation.navigate("VaultNote")} />
            <QuickAction
              label="Import Image"
              onPress={() => navigation.navigate("VaultNote", { importType: "image" })}
            />
            <QuickAction
              label="Import PDF"
              onPress={() => navigation.navigate("VaultNote", { importType: "pdf" })}
            />
            <QuickAction
              label="Import File"
              onPress={() => navigation.navigate("VaultNote", { importType: "file" })}
            />
          </View>

          <View style={themed($searchButton)}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search vault content"
              placeholderTextColor={theme.colors.textMuted}
              style={themed($searchInput)}
            />
          </View>

          <View style={themed($filterRow)}>
            {FILTER_OPTIONS.map((option) => {
              const selected = option.value === filter
              return (
                <Pressable
                  key={option.value}
                  style={themed([$filterChip, selected && $filterChipSelected])}
                  onPress={() => setFilter(option.value)}
                >
                  <Text style={themed(selected ? $filterChipTextSelected : $filterChipText)}>
                    {option.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Pressable style={themed($sortButton)} onPress={() => setSort(nextVaultSort(sort))}>
            <Text style={themed($sortButtonText)}>Sort: {sort}</Text>
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
            Vault Content
          </Text>
          {visibleItems.length === 0 ? (
            <View style={themed($emptyCard)}>
              <Text style={themed($emptyText)}>
                {filter === "deleted" ? "Trash is empty." : "No matching vault items yet."}
              </Text>
            </View>
          ) : (
            visibleItems.map((item) => (
              <Pressable
                key={item.id}
                style={({ pressed }) => [themed($noteCard), pressed && themed($notePressed)]}
                onPress={() => navigation.navigate("VaultNote", { noteId: item.noteId })}
              >
                <View style={themed($itemHeader)}>
                  <Text preset="bold" style={themed($noteTitle)} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View style={themed($itemMetaBadges)}>
                    <Text style={themed($itemBadge)}>{item.type.toUpperCase()}</Text>
                    <Text style={themed($itemBadge)}>{item.classification}</Text>
                    <Text style={themed($itemBadge)}>{item.syncStatus}</Text>
                  </View>
                </View>
                <Text style={themed($noteMeta)}>
                  Updated {new Date(item.updatedAt).toLocaleString()}
                </Text>
                <Text style={themed($noteMeta)} numberOfLines={2}>
                  {isSensitiveClassification(item.classification)
                    ? `Preview hidden for ${item.classification}`
                    : item.preview || "No preview available"}
                </Text>
              </Pressable>
            ))
          )}

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

const QuickAction = ({ label, onPress }: { label: string; onPress: () => void }) => {
  const { themed } = useAppTheme()

  return (
    <Pressable style={themed($primaryAction)} onPress={onPress}>
      <Text preset="bold" style={themed($primaryActionText)}>
        {label}
      </Text>
    </Pressable>
  )
}

type VaultListItem = {
  id: string
  noteId: string
  attachmentId?: string
  type: "note" | "image" | "pdf" | "file"
  title: string
  preview: string
  updatedAt: string
  createdAt: string
  classification: VaultClassification
  deleted: boolean
  syncStatus: "cloud" | "local"
}

const RECENT_WINDOW_MS = 1000 * 60 * 60 * 24 * 14
const FILTER_OPTIONS: Array<{ label: string; value: VaultFilter }> = [
  { label: "All", value: "all" },
  { label: "Notes", value: "notes" },
  { label: "Images", value: "images" },
  { label: "PDFs", value: "pdfs" },
  { label: "Files", value: "files" },
  { label: "Sensitive", value: "sensitive" },
  { label: "Recent", value: "recent" },
  { label: "Trash", value: "deleted" },
]

function nextVaultSort(current: VaultSort): VaultSort {
  if (current === "updated") return "created"
  if (current === "created") return "title"
  if (current === "title") return "classification"
  return "updated"
}

function compareVaultItems(a: VaultListItem, b: VaultListItem, sort: VaultSort): number {
  if (sort === "created") return b.createdAt.localeCompare(a.createdAt)
  if (sort === "title") return a.title.localeCompare(b.title)
  if (sort === "classification") return a.classification.localeCompare(b.classification)
  return b.updatedAt.localeCompare(a.updatedAt)
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

const $vaultNameText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
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

const $primaryAction: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.accentPink,
  borderRadius: 16,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.md,
  alignItems: "center",
})

const $primaryActionText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 12,
})

const $searchButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 16,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $searchInput: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textStrong,
  minHeight: 24,
})

const $quickActionsRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})

const $filterRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})

const $filterChip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.14)",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
})

const $filterChipSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.glassHeavy,
  borderColor: colors.accentPink,
})

const $filterChipText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  fontSize: 12,
})

const $filterChipTextSelected: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
  fontSize: 12,
})

const $sortButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignSelf: "flex-start",
  borderRadius: 999,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
})

const $sortButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  fontSize: 12,
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

const $itemHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: spacing.sm,
  marginBottom: 4,
})

const $itemMetaBadges: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: spacing.xs,
  flexShrink: 1,
})

const $itemBadge: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  fontSize: 10,
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

import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Alert, AppState, Image, ImageStyle, Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import * as DocumentPicker from "expo-document-picker"
import * as FileSystem from "expo-file-system/legacy"
import * as Sharing from "expo-sharing"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { VaultStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import {
  deleteNote,
  getNote,
  listNoteIds,
  moveNoteToTrash,
  NoteAttachment,
  restoreNote,
  saveNote,
} from "@/locker/storage/notesRepo"
import { getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { base64ToBytes, bytesToBase64 } from "@/locker/crypto/encoding"
import { buildAttachmentBlobBytes, buildAttachmentBlobId, generateAttachmentId, parseAttachmentBlobBytes } from "@/locker/attachments/attachmentCodec"
import { writeEncryptedAttachment, readEncryptedAttachment, hasEncryptedAttachment } from "@/locker/attachments/attachmentCache"
import { sha256Hex } from "@/locker/crypto/sha"
import { enqueueUpdateIndexData, enqueueUpsertAttachmentBlob, enqueueUpsertNoteData } from "@/locker/sync/queue"
import { getAccount } from "@/locker/storage/accountRepo"
import { requestSync } from "@/locker/sync/syncCoordinator"
import { fetchJson, fetchRaw } from "@/locker/net/apiClient"
import { getToken } from "@/locker/auth/tokenStore"
import {
  DEFAULT_VAULT_CLASSIFICATION,
  getVaultItemTypeFromMime,
  VAULT_CLASSIFICATIONS,
  VaultClassification,
} from "@/locker/vault/types"
import { ensureElevatedSession } from "@/locker/security/stepUp"
import { recordSecurityEvent } from "@/locker/security/auditLogRepo"

type VaultMemberRecord = {
  userId: string
  role?: "owner" | "admin" | "editor" | "viewer"
}

const fileSystemCompat = FileSystem as any

export const VaultNoteScreen: FC<VaultStackScreenProps<"VaultNote">> = function VaultNoteScreen(
  props,
) {
  const { navigation, route } = props
  const { themed, theme } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [vaultId, setVaultId] = useState<string | null>(null)
  const [classification, setClassification] = useState<VaultClassification>(DEFAULT_VAULT_CLASSIFICATION)
  const [deletedAt, setDeletedAt] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<NoteAttachment[]>([])
  const [attachmentStates, setAttachmentStates] = useState<Record<string, AttachmentUiState>>({})
  const [role, setRole] = useState<"owner" | "admin" | "editor" | "viewer" | "unknown">("unknown")
  const [error, setError] = useState<string | null>(null)
  const [isExisting, setIsExisting] = useState(false)

  const noteId = route.params?.noteId
  const canAddAttachments = role !== "viewer"
  const attachmentScope = vaultId ?? LOCAL_ATTACHMENT_SCOPE

  const loadNote = useCallback(() => {
    const key = vaultSession.getKey()
    if (!key || !noteId) return
    try {
      const note = getNote(noteId, key)
      setTitle(note.title)
      setBody(note.body)
      setVaultId(note.vaultId ?? null)
      setClassification(note.classification ?? DEFAULT_VAULT_CLASSIFICATION)
      setDeletedAt(note.deletedAt ?? null)
      setAttachments(note.attachments ?? [])
      setIsExisting(true)
      setError(null)
    } catch {
      setError("Vault data error")
    }
  }, [noteId])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      loadNote()
    }, [navigation, loadNote]),
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
    if (!noteId) {
      setIsExisting(false)
      setTitle("")
      setBody("")
      setVaultId(getRemoteVaultId())
      setClassification(DEFAULT_VAULT_CLASSIFICATION)
      setDeletedAt(null)
      setAttachments([])
      setError(null)
    }
  }, [noteId])

  const handleSave = () => {
    const key = vaultSession.getKey()
    if (!key) return
    const saved = saveNote(
      { id: noteId, title: title.trim(), body, classification, deletedAt, vaultId, attachments },
      key,
    )
    navigation.replace("VaultNote", { noteId: saved.id })
  }

  const handleMoveToTrash = () => {
    if (!noteId) return
    const key = vaultSession.getKey()
    if (!key) return
    try {
      const saved = moveNoteToTrash(noteId, key)
      if (!saved) return
      setDeletedAt(saved.deletedAt ?? null)
      setError(null)
    } catch {
      setError("Failed to move note to trash")
    }
  }

  const handleRestore = () => {
    if (!noteId) return
    const key = vaultSession.getKey()
    if (!key) return
    try {
      const saved = restoreNote(noteId, key)
      if (!saved) return
      setDeletedAt(saved.deletedAt ?? null)
      setError(null)
    } catch {
      setError("Failed to restore note")
    }
  }

  const handlePermanentDelete = () => {
    if (!noteId) return
    const key = vaultSession.getKey()
    void (async () => {
      try {
        await ensureElevatedSession("permanent delete")
        deleteNote(noteId, key ?? undefined)
        recordSecurityEvent({
          type: "secure_delete",
          message: "Permanent delete completed for a vault note.",
          severity: "warning",
          meta: { noteId },
        })
        navigation.goBack()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Step-up required"
        setError(message)
      }
    })()
  }

  const loadRole = useCallback(async () => {
    if (!vaultId) {
      setRole("unknown")
      return
    }
    const account = getAccount()
    if (!account) {
      setRole("unknown")
      return
    }
    try {
      const data = await fetchJson<{ members: VaultMemberRecord[] }>(`/v1/vaults/${vaultId}/members`)
      const member = data.members?.find((m) => m.userId === account.user.id)
      setRole((member?.role as any) || "unknown")
    } catch {
      setRole("unknown")
    }
  }, [vaultId])

  const downloadAttachment = useCallback(
    async (att: NoteAttachment, options?: { silent?: boolean }) => {
      const key = vaultId ? await getRemoteVaultKey(vaultId) : vaultSession.getKey()
      if (!key) {
        if (!options?.silent) setError("Missing attachment key")
        return
      }
      setAttachmentStates((prev) => ({ ...prev, [att.id]: { status: "downloading" } }))
      try {
        if (!vaultId) {
          const bytes = await readEncryptedAttachment(attachmentScope, att.id)
          if (!bytes) throw new Error("Attachment not cached")
          const payload = parseAttachmentBlobBytes(bytes, key)
          const dataUri = payload.mime.startsWith("image/")
            ? `data:${payload.mime};base64,${bytesToBase64(payload.fileBytes)}`
            : undefined
          setAttachmentStates((prev) => ({ ...prev, [att.id]: { status: "ready", dataUri } }))
          return
        }
        const token = await getToken()
        if (!token) throw new Error("Link device first")
        const bytes = await fetchRaw(`/v1/vaults/${vaultId}/blobs/${att.blobId}`, {}, { token })
        if (att.sha256 && sha256Hex(bytes) !== att.sha256) {
          setAttachmentStates((prev) => ({
            ...prev,
            [att.id]: { status: "corrupt", error: "Integrity check failed" },
          }))
          return
        }
        await writeEncryptedAttachment(attachmentScope, att.id, bytes)
        let payload: ReturnType<typeof parseAttachmentBlobBytes> | null = null
        try {
          payload = parseAttachmentBlobBytes(bytes, key)
        } catch {
          setAttachmentStates((prev) => ({
            ...prev,
            [att.id]: { status: "corrupt", error: "Unreadable attachment" },
          }))
          return
        }
        if (payload.attId !== att.id) {
          setAttachmentStates((prev) => ({
            ...prev,
            [att.id]: { status: "corrupt", error: "Attachment mismatch" },
          }))
          return
        }
        const dataUri = payload.mime.startsWith("image/")
          ? `data:${payload.mime};base64,${bytesToBase64(payload.fileBytes)}`
          : undefined
        setAttachmentStates((prev) => ({ ...prev, [att.id]: { status: "ready", dataUri } }))
      } catch (err) {
        const message = err instanceof Error ? err.message : "Attachment download failed"
        setAttachmentStates((prev) => ({ ...prev, [att.id]: { status: "error", error: message } }))
        if (!options?.silent) setError(message)
      }
    },
    [attachmentScope, vaultId],
  )

  const refreshAttachmentStates = useCallback(async () => {
    if (attachments.length === 0) return
    const key = vaultId ? await getRemoteVaultKey(vaultId) : vaultSession.getKey()
    if (!key) return

    let cancelled = false

    const run = async () => {
      for (const att of attachments) {
        if (cancelled) return
        const cached = await hasEncryptedAttachment(attachmentScope, att.id)
        if (!cached) {
          if (vaultId && att.sizeBytes <= AUTO_DOWNLOAD_MAX_BYTES) {
            void downloadAttachment(att, { silent: true })
          }
          continue
        }

        try {
          const bytes = await readEncryptedAttachment(attachmentScope, att.id)
          if (!bytes) continue
          if (att.sha256 && sha256Hex(bytes) !== att.sha256) {
            setAttachmentStates((prev) => ({
              ...prev,
              [att.id]: { status: "corrupt", error: "Integrity check failed" },
            }))
            continue
          }
          const payload = parseAttachmentBlobBytes(bytes, key)
          if (payload.attId !== att.id) {
            setAttachmentStates((prev) => ({
              ...prev,
              [att.id]: { status: "corrupt", error: "Attachment mismatch" },
            }))
            continue
          }
          const dataUri = payload.mime.startsWith("image/")
            ? `data:${payload.mime};base64,${bytesToBase64(payload.fileBytes)}`
            : undefined
          setAttachmentStates((prev) => ({
            ...prev,
            [att.id]: { status: "ready", dataUri },
          }))
        } catch {
          setAttachmentStates((prev) => ({
            ...prev,
            [att.id]: { status: "corrupt", error: "Unreadable attachment" },
          }))
        }
      }
    }

    await run()
    return () => {
      cancelled = true
    }
  }, [attachmentScope, attachments, vaultId, downloadAttachment])

  useFocusEffect(
    useCallback(() => {
      void loadRole()
    }, [loadRole]),
  )

  useEffect(() => {
    void refreshAttachmentStates()
  }, [refreshAttachmentStates])

  const openAttachment = useCallback(
    async (att: NoteAttachment) => {
      const key = vaultId ? await getRemoteVaultKey(vaultId) : vaultSession.getKey()
      if (!key) {
        setError("Missing attachment key")
        return
      }
      try {
        let bytes = await readEncryptedAttachment(attachmentScope, att.id)
        if (!bytes) {
          if (!vaultId) throw new Error("Attachment not cached on this device")
          const token = await getToken()
          if (!token) throw new Error("Link device first")
          bytes = await fetchRaw(`/v1/vaults/${vaultId}/blobs/${att.blobId}`, {}, { token })
          await writeEncryptedAttachment(attachmentScope, att.id, bytes)
        }
        if (att.sha256 && sha256Hex(bytes) !== att.sha256) {
          setAttachmentStates((prev) => ({
            ...prev,
            [att.id]: { status: "corrupt", error: "Integrity check failed" },
          }))
          throw new Error("Attachment integrity mismatch")
        }
        let payload: ReturnType<typeof parseAttachmentBlobBytes> | null = null
        try {
          payload = parseAttachmentBlobBytes(bytes, key)
        } catch {
          setAttachmentStates((prev) => ({
            ...prev,
            [att.id]: { status: "corrupt", error: "Unreadable attachment" },
          }))
          throw new Error("Unreadable attachment")
        }
        const filename = payload.filename ?? att.filename ?? `attachment-${att.id}`
        const dir = `${fileSystemCompat.cacheDirectory ?? fileSystemCompat.documentDirectory ?? ""}locker/attachments`
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
        const safeName = filename.replace(/[\\/]/g, "_")
        const path = `${dir}/${safeName}`
        await FileSystem.writeAsStringAsync(path, bytesToBase64(payload.fileBytes), {
          encoding: fileSystemCompat.EncodingType.Base64,
        })
        const canShare = await Sharing.isAvailableAsync()
        if (!canShare) {
          Alert.alert("Open attachment", "Sharing is not available on this device.")
          return
        }
        await Sharing.shareAsync(path, { mimeType: payload.mime })
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to open attachment"
        setError(message)
      }
    },
    [attachmentScope, vaultId],
  )

  const handleAddAttachment = useCallback(async (kind: "image" | "pdf" | "file" = "file") => {
    if (!vaultSession.isUnlocked()) return
    if (!canAddAttachments) {
      setError("Viewers cannot add attachments")
      return
    }
    const vmk = vaultSession.getKey()
    if (!vmk) return

    const picked = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: kind === "image" ? "image/*" : kind === "pdf" ? "application/pdf" : "*/*",
    })
    if (picked.canceled) return
    const asset = picked.assets?.[0]
    if (!asset?.uri) return

    let activeNoteId = noteId
    if (!activeNoteId) {
      const initialTitle = title.trim() || stripExtension(asset.name) || "Imported File"
      const saved = saveNote(
        { title: initialTitle, body, classification, deletedAt, vaultId, attachments },
        vmk,
      )
      activeNoteId = saved.id
      setIsExisting(true)
      setTitle(saved.title)
      setVaultId(saved.vaultId ?? null)
      navigation.replace("VaultNote", { noteId: saved.id })
    }

    const fileBase64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: fileSystemCompat.EncodingType.Base64,
    })
    const fileBytes = base64ToBytes(fileBase64)
    if (fileBytes.length > MAX_ATTACHMENT_BYTES) {
      setError(`Attachment exceeds ${formatBytes(MAX_ATTACHMENT_BYTES)} limit`)
      return
    }

    const attachmentKey = vaultId ? await getRemoteVaultKey(vaultId) : vmk
    if (!attachmentKey) {
      setError("Missing attachment key for this note")
      return
    }

    const attId = generateAttachmentId()
    const mime = asset.mimeType ?? "application/octet-stream"
    const blobBytes = buildAttachmentBlobBytes({
      rvk: attachmentKey,
      noteId: activeNoteId,
      attId,
      fileBytes,
      filename: asset.name ?? null,
      mime,
    })
    const blobId = buildAttachmentBlobId(activeNoteId, attId)
    const record: NoteAttachment = {
      id: attId,
      filename: asset.name ?? null,
      mime,
      sizeBytes: fileBytes.length,
      sha256: sha256Hex(blobBytes),
      blobId,
      createdAt: new Date().toISOString(),
    }

    await writeEncryptedAttachment(attachmentScope, attId, blobBytes)

    const nextAttachments = [...attachments, record]
    const saved = saveNote(
      {
        id: activeNoteId,
        title: title.trim() || stripExtension(asset.name) || "Imported File",
        body,
        classification,
        deletedAt,
        vaultId,
        attachments: nextAttachments,
      },
      vmk,
      { suppressSync: true },
    )
    setAttachments(nextAttachments)
    const dataUri = mime.startsWith("image/")
      ? `data:${mime};base64,${bytesToBase64(fileBytes)}`
      : undefined
    setAttachmentStates((prev) => ({ ...prev, [attId]: { status: "ready", dataUri } }))

    const deviceId = getAccount()?.device.id
    if (deviceId && vaultId) {
      enqueueUpdateIndexData(listNoteIds(vaultId), vaultId, attachmentKey, deviceId)
      enqueueUpsertNoteData(saved, vaultId, attachmentKey, deviceId)
      enqueueUpsertAttachmentBlob({ vaultId, bytes: blobBytes, noteId: activeNoteId, attId })
      void requestSync("note_change", vaultId)
    }
  }, [attachmentScope, attachments, body, canAddAttachments, classification, deletedAt, navigation, noteId, title, vaultId])

  useEffect(() => {
    const importType = route.params?.importType
    if (!importType || !vaultSession.isUnlocked()) return
    if (deletedAt) return
    const timer = setTimeout(() => {
      void handleAddAttachment(importType)
      navigation.setParams({ importType: undefined })
    }, 50)
    return () => clearTimeout(timer)
  }, [deletedAt, handleAddAttachment, navigation, route.params?.importType])

  const attachmentInfo = useMemo(() => {
    return attachments.map((att) => ({
      att,
      state: attachmentStates[att.id] ?? { status: "idle" as const },
    }))
  }, [attachments, attachmentStates])

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Secure Note
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          {noteId ? "Edit" : "New"}
        </Text>
      </View>

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}

      <View style={themed($card)}>
        <TextInput
          placeholder="Title"
          placeholderTextColor={theme.colors.palette.neutral400}
          style={themed($titleInput)}
          value={title}
          onChangeText={setTitle}
        />
        <View style={themed($divider)} />
        <TextInput
          placeholder="Write your note..."
          placeholderTextColor={theme.colors.palette.neutral400}
          style={themed($bodyInput)}
          value={body}
          onChangeText={setBody}
          multiline
        />
      </View>

      <View style={themed($classificationSection)}>
        <Text preset="subheading" style={themed($sectionTitle)}>
          Classification
        </Text>
        <View style={themed($chipRow)}>
          {VAULT_CLASSIFICATIONS.map((option) => {
            const selected = option === classification
            return (
              <Pressable
                key={option}
                style={themed([$chip, selected && $chipSelected])}
                onPress={() => setClassification(option)}
              >
                <Text style={themed(selected ? $chipTextSelected : $chipText)}>{option}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={themed($attachmentSection)}>
        <Text preset="subheading" style={themed($sectionTitle)}>
          Attachments
        </Text>
        {attachmentInfo.length === 0 ? (
          <Text style={themed($attachmentMeta)}>No attachments yet.</Text>
        ) : (
          attachmentInfo.map(({ att, state }) => (
            <View key={att.id} style={themed($attachmentCard)}>
              {state.dataUri ? (
                <Pressable onPress={() => void openAttachment(att)}>
                  <Image source={{ uri: state.dataUri }} style={themed($attachmentImage)} />
                </Pressable>
              ) : (
                <View style={themed($attachmentPlaceholder)}>
                  <Text style={themed($attachmentPlaceholderText)}>FILE</Text>
                </View>
              )}
              <View style={themed($attachmentBody)}>
                <Text preset="bold" style={themed($attachmentName)}>
                  {att.filename ?? "Attachment"}
                </Text>
                <Text style={themed($attachmentMeta)}>
                  {formatBytes(att.sizeBytes)} · {att.mime} · {getVaultItemTypeFromMime(att.mime)}
                </Text>
                {state.status === "corrupt" ? (
                  <Text style={themed($attachmentError)}>Unreadable attachment</Text>
                ) : null}
                {state.status === "error" ? (
                  <Text style={themed($attachmentError)}>{state.error ?? "Download failed"}</Text>
                ) : null}
              </View>
              <View style={themed($attachmentActions)}>
                {state.status === "ready" ? (
                  <Pressable style={themed($attachmentButton)} onPress={() => void openAttachment(att)}>
                    <Text style={themed($attachmentButtonText)}>Open</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={themed($attachmentButton)}
                    onPress={() => void downloadAttachment(att)}
                  >
                    <Text style={themed($attachmentButtonText)}>
                      {state.status === "downloading" ? "Loading…" : "Download"}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        )}

        {isExisting ? (
          <View style={themed($quickActionRow)}>
            <Pressable
              style={themed([$secondaryButton, $quickActionButton, !canAddAttachments && $disabledButton])}
              onPress={() => void handleAddAttachment("image")}
              disabled={!canAddAttachments}
            >
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Import Image
              </Text>
            </Pressable>
            <Pressable
              style={themed([$secondaryButton, $quickActionButton, !canAddAttachments && $disabledButton])}
              onPress={() => void handleAddAttachment("pdf")}
              disabled={!canAddAttachments}
            >
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Import PDF
              </Text>
            </Pressable>
            <Pressable
              style={themed([$secondaryButton, $quickActionButton, !canAddAttachments && $disabledButton])}
              onPress={() => void handleAddAttachment("file")}
              disabled={!canAddAttachments}
            >
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Import File
              </Text>
            </Pressable>
          </View>
        ) : (
          <Text style={themed($attachmentMeta)}>Import actions will create the note if needed.</Text>
        )}
        {!canAddAttachments ? (
          <Text style={themed($attachmentMeta)}>Viewer role cannot upload attachments.</Text>
        ) : null}
      </View>

      <Pressable style={themed($primaryButton)} onPress={handleSave}>
        <Text preset="bold" style={themed($primaryButtonText)}>
          Save Note
        </Text>
      </Pressable>

      {isExisting && !deletedAt ? (
        <Pressable style={themed($deleteButton)} onPress={handleMoveToTrash}>
          <Text preset="bold" style={themed($deleteButtonText)}>
            Move To Trash
          </Text>
        </Pressable>
      ) : null}

      {isExisting && deletedAt ? (
        <View style={themed($trashedActions)}>
          <Text style={themed($attachmentMeta)}>
            Trashed {new Date(deletedAt).toLocaleString()}
          </Text>
          <Pressable style={themed($secondaryButton)} onPress={handleRestore}>
            <Text preset="bold" style={themed($secondaryButtonText)}>
              Restore Note
            </Text>
          </Pressable>
          <Pressable style={themed($deleteButton)} onPress={handlePermanentDelete}>
            <Text preset="bold" style={themed($deleteButtonText)}>
              Delete Permanently
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Screen>
  )
}

type AttachmentUiState = {
  status: "idle" | "downloading" | "ready" | "error" | "corrupt"
  dataUri?: string
  error?: string
}

const LOCAL_ATTACHMENT_SCOPE = "__local__"
const MAX_ATTACHMENT_BYTES = 5_000_000
const AUTO_DOWNLOAD_MAX_BYTES = 200_000

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${bytes} B`
}

function stripExtension(filename?: string | null): string {
  if (!filename) return ""
  const index = filename.lastIndexOf(".")
  return index > 0 ? filename.slice(0, index) : filename
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
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

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 20,
  padding: spacing.lg,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.1)",
  marginBottom: spacing.lg,
})

const $divider: ThemedStyle<ViewStyle> = () => ({
  height: 1,
  backgroundColor: "rgba(255, 255, 255, 0.1)",
  marginVertical: 12,
})

const $titleInput: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 18,
  fontWeight: "600",
})

const $bodyInput: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
  fontSize: 16,
  minHeight: 180,
  textAlignVertical: "top",
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 16,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginBottom: spacing.md,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $deleteButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingVertical: spacing.sm,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.2)",
})

const $deleteButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
  marginBottom: 12,
})

const $classificationSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $chipRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})

const $chip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 999,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.18)",
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
})

const $chipSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.accentPink,
  borderColor: colors.accentPink,
})

const $chipText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
  fontSize: 12,
})

const $chipTextSelected: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 12,
})

const $attachmentSection: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  marginBottom: 8,
})

const $attachmentCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "rgba(255, 255, 255, 0.06)",
  borderRadius: 16,
  padding: spacing.md,
  marginBottom: spacing.sm,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.08)",
})

const $attachmentPlaceholder: ThemedStyle<ViewStyle> = () => ({
  width: 52,
  height: 52,
  borderRadius: 12,
  backgroundColor: "rgba(255,255,255,0.08)",
  alignItems: "center",
  justifyContent: "center",
})

const $attachmentPlaceholderText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
  fontSize: 12,
})

const $attachmentImage: ThemedStyle<ImageStyle> = () => ({
  width: 52,
  height: 52,
  borderRadius: 12,
})

const $attachmentBody: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  marginLeft: spacing.md,
})

const $attachmentName: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $attachmentMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
  fontSize: 12,
})

const $attachmentError: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
  fontSize: 12,
})

const $attachmentActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginLeft: spacing.sm,
})

const $attachmentButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.2)",
})

const $attachmentButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
  fontSize: 12,
})

const $disabledButton: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.5,
})

const $quickActionRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $quickActionButton: ThemedStyle<ViewStyle> = () => ({
  marginBottom: 0,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $trashedActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  marginBottom: spacing.lg,
})

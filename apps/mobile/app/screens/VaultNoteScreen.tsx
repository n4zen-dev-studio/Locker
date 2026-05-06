import { FC, useCallback, useEffect, useMemo, useState } from "react"
import {
  Alert,
  AppState,
  Image,
  ImageStyle,
  Pressable,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import * as DocumentPicker from "expo-document-picker"
import * as FileSystem from "expo-file-system/legacy"
import * as Sharing from "expo-sharing"
import { LinearGradient } from "expo-linear-gradient"
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from "react-native-svg"
import { Ionicons } from "@expo/vector-icons"
import {
  FileText,
  Image as LucideImage,
  LockKeyhole,
  NotebookPen,
  Paperclip,
  Save,
  Shield,
  Trash2,
  Upload,
} from "lucide-react-native"

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
import {
  buildAttachmentBlobBytes,
  buildAttachmentBlobId,
  generateAttachmentId,
  parseAttachmentBlobBytes,
} from "@/locker/attachments/attachmentCodec"
import {
  writeEncryptedAttachment,
  readEncryptedAttachment,
  hasEncryptedAttachment,
} from "@/locker/attachments/attachmentCache"
import { sha256Hex } from "@/locker/crypto/sha"
import {
  enqueueUpdateIndexData,
  enqueueUpsertAttachmentBlob,
  enqueueUpsertNoteData,
} from "@/locker/sync/queue"
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
import { VaultHubBackground } from "@/components/VaultHubBackground"

type VaultMemberRecord = {
  userId: string
  role?: "owner" | "admin" | "editor" | "viewer"
}

type AttachmentUiState = {
  status: "idle" | "downloading" | "ready" | "error" | "corrupt"
  dataUri?: string
  error?: string
}

const LOCAL_ATTACHMENT_SCOPE = "__local__"
const MAX_ATTACHMENT_BYTES = 5_000_000
const AUTO_DOWNLOAD_MAX_BYTES = 200_000

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
  const [classification, setClassification] = useState<VaultClassification>(
    DEFAULT_VAULT_CLASSIFICATION,
  )
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
    navigation.goBack()
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

  const handleAddAttachment = useCallback(
    async (kind: "image" | "pdf" | "file" = "file") => {
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
    },
    [
      attachmentScope,
      attachments,
      body,
      canAddAttachments,
      classification,
      deletedAt,
      navigation,
      noteId,
      title,
      vaultId,
    ],
  )

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
    <Screen preset="scroll" contentContainerStyle={themed([$insets, $screen])}>
      <VaultHubBackground reducedMotion={true} dimmed/>
      {/* <View style={themed($backgroundGlowTop)} pointerEvents="none" />
      <View style={themed($backgroundGlowMiddle)} pointerEvents="none" /> */}

      <View style={themed($heroCard)}>
        <View style={themed($heroTopRow)}>
          <View style={themed($heroBadge)}>
            <Shield size={13} color="#FFD8FA" />
            <Text style={themed($heroBadgeText)}>Encrypted note</Text>
          </View>

          <View style={themed($rolePill)}>
            <LockKeyhole size={12} color="#FCE7FF" />
            <Text style={themed($rolePillText)}>{role}</Text>
          </View>
        </View>

        <View style={themed($heroTitleRow)}>
          <View style={themed($heroIconWrap)}>
            <NotebookPen size={18} color="#FFF5FF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={themed($heroTitle)}>Secure Item</Text>
            <Text style={themed($heroSubtitle)}>{noteId ? "Edit note" : "Create new note"}</Text>
          </View>
        </View>

        {error ? (
          <View style={themed($errorBanner)}>
            <Ionicons name="alert-circle-outline" size={14} color="#FFB6C7" />
            <Text style={themed($errorBannerText)}>{error}</Text>
          </View>
        ) : null}
      </View>

      <GlassSection
        themed={themed}
        title="Content"
        subtitle="Title and note body"
        icon={<NotebookPen size={14} color="#FFC8F3" />}
      >
        <IconTextInput
          themed={themed}
          theme={theme}
          placeholder="Title"
          value={title}
          onChangeText={setTitle}
          icon={<NotebookPen size={15} color="rgba(255,255,255,0.75)" />}
          multiline={false}
          inputStyle={themed($titleInput)}
        />

        <View style={themed($inputGap)} />

        <IconTextInput
          themed={themed}
          theme={theme}
          placeholder="Write a note..."
          value={body}
          onChangeText={setBody}
          icon={<FileText size={15} color="rgba(255,255,255,0.75)" />}
          multiline
          inputStyle={themed($bodyInput)}
          containerStyle={themed($bodyInputWrap)}
        />
      </GlassSection>

      <GlassSection
        themed={themed}
        title="Classification"
        subtitle="Choose protection label"
        icon={<Shield size={14} color="#FFC8F3" />}
      >
        <View style={themed($chipRow)}>
          {VAULT_CLASSIFICATIONS.map((option) => {
            const selected = option === classification
            return (
              <GlassChip
                key={option}
                themed={themed}
                label={option}
                selected={selected}
                onPress={() => setClassification(option)}
              />
            )
          })}
        </View>
      </GlassSection>

      <GlassSection
        themed={themed}
        title="Attachments"
        subtitle={attachmentInfo.length === 0 ? "No attachments yet" : `${attachmentInfo.length} attached`}
        icon={<Paperclip size={14} color="#FFC8F3" />}
        rightSlot={
          isExisting ? (
            <Text style={themed($tinyMetaText)}>{canAddAttachments ? "Ready to import" : "Viewer mode"}</Text>
          ) : null
        }
      >
        {attachmentInfo.length === 0 ? (
          <View style={themed($emptyAttachmentState)}>
            <View style={themed($emptyAttachmentIconWrap)}>
              <Paperclip size={18} color="#F7D3FF" />
            </View>
            <Text style={themed($emptyAttachmentTitle)}>No attachments yet</Text>
            <Text style={themed($emptyAttachmentSubtitle)}>
              Add images, PDFs, or files to this secure note.
            </Text>
          </View>
        ) : (
          <View style={themed($attachmentList)}>
            {attachmentInfo.map(({ att, state }) => (
              <AttachmentRow
                key={att.id}
                themed={themed}
                att={att}
                state={state}
                onOpen={() => void openAttachment(att)}
                onDownload={() => void downloadAttachment(att)}
              />
            ))}
          </View>
        )}

        {isExisting ? (
          <View style={themed($quickActionGrid)}>
            <MiniIconButton
              themed={themed}
              label="Image"
              icon={<LucideImage size={14} color="#FFE8FD" />}
              onPress={() => void handleAddAttachment("image")}
              disabled={!canAddAttachments}
            />
            <MiniIconButton
              themed={themed}
              label="PDF"
              icon={<FileText size={14} color="#FFE8FD" />}
              onPress={() => void handleAddAttachment("pdf")}
              disabled={!canAddAttachments}
            />
            <MiniIconButton
              themed={themed}
              label="File"
              icon={<Upload size={14} color="#FFE8FD" />}
              onPress={() => void handleAddAttachment("file")}
              disabled={!canAddAttachments}
            />
          </View>
        ) : (
          <Text style={themed($tinyMetaText)}>Import actions will create the note if needed.</Text>
        )}

        {!canAddAttachments ? (
          <Text style={themed($tinyMetaText)}>Viewer role cannot upload attachments.</Text>
        ) : null}
      </GlassSection>

      <GradientPrimaryButton
        label="Save Note"
        icon={<Save size={15} color="#1D0820" />}
        onPress={handleSave}
        themed={themed}
      />

      {isExisting && !deletedAt ? (
        <GhostDangerButton
          label="Move To Trash"
          icon={<Trash2 size={15} color="#FF9EB7" />}
          onPress={handleMoveToTrash}
          themed={themed}
        />
      ) : null}

      {isExisting && deletedAt ? (
        <GlassSection
          themed={themed}
          title="Trashed"
          subtitle={`Moved ${new Date(deletedAt).toLocaleString()}`}
          icon={<Trash2 size={14} color="#FFB5C7" />}
        >
          <View style={themed($trashedActions)}>
            <GhostButton
              label="Restore Note"
              icon={<Ionicons name="refresh-outline" size={15} color="#F9E7FF" />}
              onPress={handleRestore}
              themed={themed}
            />
            <GhostDangerButton
              label="Delete Permanently"
              icon={<Trash2 size={15} color="#FF9EB7" />}
              onPress={handlePermanentDelete}
              themed={themed}
            />
          </View>
        </GlassSection>
      ) : null}
    </Screen>
  )
}

function GlassSection(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  title: string
  subtitle?: string
  icon?: React.ReactNode
  rightSlot?: React.ReactNode
  children: React.ReactNode
}) {
  const { themed, title, subtitle, icon, rightSlot, children } = props

  return (
    <View style={themed($sectionCard)}>
      <View style={themed($sectionHeader)}>
        <View style={themed($sectionHeaderLeft)}>
          {icon ? <View style={themed($sectionIconWrap)}>{icon}</View> : null}
          <View>
            <Text style={themed($sectionTitle)}>{title}</Text>
            {subtitle ? <Text style={themed($sectionSubtitle)}>{subtitle}</Text> : null}
          </View>
        </View>
        {rightSlot}
      </View>
      {children}
    </View>
  )
}

function IconTextInput(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  theme: ReturnType<typeof useAppTheme>["theme"]
  placeholder: string
  value: string
  onChangeText: (value: string) => void
  icon: React.ReactNode
  multiline?: boolean
  inputStyle?: TextStyle
  containerStyle?: ViewStyle
}) {
  const { themed, theme, icon, inputStyle, containerStyle, multiline, ...rest } = props

  return (
    <View style={[themed($glassInput), containerStyle]}>
      <View style={themed($glassInputIconWrap)}>{icon}</View>
      <TextInput
        {...rest}
        multiline={multiline}
        placeholderTextColor={theme.colors.textDim}
        style={[themed($glassInputField), inputStyle]}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  )
}

function GlassChip(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  label: string
  selected?: boolean
  onPress?: () => void
}) {
  const { themed, label, selected, onPress } = props

  if (selected) {
    return (
      <Pressable onPress={onPress} style={themed($chipPressable)}>
        <LinearGradient
          colors={["#FF8AE2", "#D85CFF", "#A857FF"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={themed($chipSelected)}
        >
          <Text style={themed($chipTextSelected)}>{label}</Text>
        </LinearGradient>
      </Pressable>
    )
  }

  return (
    <Pressable onPress={onPress} style={themed($chip)}>
      <Text style={themed($chipText)}>{label}</Text>
    </Pressable>
  )
}

function MiniIconButton(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  label: string
  icon: React.ReactNode
  onPress?: () => void
  disabled?: boolean
}) {
  const { themed, label, icon, onPress, disabled } = props

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={themed([$miniActionButton, disabled && $disabledButton])}
    >
      <View style={themed($miniActionIconWrap)}>{icon}</View>
      <Text style={themed($miniActionText)}>{label}</Text>
    </Pressable>
  )
}

function GradientPrimaryButton(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  label: string
  icon?: React.ReactNode
  onPress?: () => void
}) {
  const { themed, label, icon, onPress } = props

  return (
    <Pressable onPress={onPress} style={themed($buttonBlock)}>
      <LinearGradient
        colors={["#FFA2EA", "#F06DFF", "#BF69FF"]}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 1, y: 0.7 }}
        style={themed($primaryButton)}
      >
        <Svg style={themed($buttonSheen)} width="100%" height="100%" viewBox="0 0 100 100">
          <Defs>
            <SvgLinearGradient id="buttonSheen" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
              <Stop offset="38%" stopColor="rgba(255,255,255,0.12)" />
              <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </SvgLinearGradient>
          </Defs>
          {/* <Rect x="0" y="0" width="100" height="100" rx="20" fill="url(#buttonSheen)" /> */}
        </Svg>

        <View style={themed($primaryButtonContent)}>
          {/* {icon} */}
          <Text style={themed($primaryButtonText)}>{label}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  )
}

function GhostButton(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  label: string
  icon?: React.ReactNode
  onPress?: () => void
}) {
  const { themed, label, icon, onPress } = props

  return (
    <Pressable onPress={onPress} style={themed($ghostButton)}>
      <View style={themed($ghostButtonContent)}>
        {icon}
        <Text style={themed($ghostButtonText)}>{label}</Text>
      </View>
    </Pressable>
  )
}

function GhostDangerButton(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  label: string
  icon?: React.ReactNode
  onPress?: () => void
}) {
  const { themed, label, icon, onPress } = props

  return (
    <Pressable onPress={onPress} style={themed($dangerButton)}>
      <View style={themed($ghostButtonContent)}>
        {icon}
        <Text style={themed($dangerButtonText)}>{label}</Text>
      </View>
    </Pressable>
  )
}

function AttachmentRow(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  att: NoteAttachment
  state: AttachmentUiState
  onOpen: () => void
  onDownload: () => void
}) {
  const { themed, att, state, onOpen, onDownload } = props

  const isImage = att.mime.startsWith("image/")
  const itemType = getVaultItemTypeFromMime(att.mime)

  return (
    <View style={themed($attachmentCard)}>
      {state.dataUri ? (
        <Pressable onPress={onOpen}>
          <Image source={{ uri: state.dataUri }} style={themed($attachmentImage)} />
        </Pressable>
      ) : (
        <View style={themed($attachmentPlaceholder)}>
          {itemType === "image" ? (
            <LucideImage size={18} color="#F5D8FF" />
          ) : itemType === "pdf" ? (
            <FileText size={18} color="#F5D8FF" />
          ) : (
            <Paperclip size={18} color="#F5D8FF" />
          )}
        </View>
      )}

      <View style={themed($attachmentBody)}>
        <Text numberOfLines={1} style={themed($attachmentName)}>
          {att.filename ?? "Attachment"}
        </Text>
        <Text numberOfLines={1} style={themed($attachmentMeta)}>
          {formatBytes(att.sizeBytes)} · {att.mime}
        </Text>
        {state.status === "corrupt" ? (
          <Text style={themed($attachmentError)}>Unreadable attachment</Text>
        ) : null}
        {state.status === "error" ? (
          <Text style={themed($attachmentError)}>{state.error ?? "Download failed"}</Text>
        ) : null}
      </View>

      <Pressable
        style={themed($attachmentButton)}
        onPress={state.status === "ready" ? onOpen : onDownload}
      >
        <Text style={themed($attachmentButtonText)}>
          {state.status === "downloading"
            ? "Loading…"
            : state.status === "ready"
              ? "Open"
              : "Get"}
        </Text>
      </Pressable>
    </View>
  )
}

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

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.xxl,
  backgroundColor: "#07060A",
})

const $backgroundGlowTop: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: -80,
  left: -30,
  right: -30,
  height: 240,
  borderRadius: 999,
  backgroundColor: "rgba(226, 89, 255, 0.18)",
  shadowColor: "#E65CFF",
  shadowOpacity: 0.5,
  shadowRadius: 90,
  shadowOffset: { width: 0, height: 0 },
})

const $backgroundGlowMiddle: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 180,
  right: -40,
  width: 180,
  height: 180,
  borderRadius: 999,
  backgroundColor: "rgba(255, 120, 220, 0.08)",
  shadowColor: "#FF7BDD",
  shadowOpacity: 0.45,
  shadowRadius: 80,
  shadowOffset: { width: 0, height: 0 },
})

const $heroCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
  marginBottom: spacing.sm,
  padding: spacing.md,
  borderRadius: 24,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.09)",
  overflow: "hidden",
})

const $heroTopRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 14,
})

const $heroBadge: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $heroBadgeText: ThemedStyle<TextStyle> = () => ({
  color: "#F8DFFF",
  fontSize: 11,
  fontWeight: "600",
})

const $rolePill: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  paddingHorizontal: 9,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $rolePillText: ThemedStyle<TextStyle> = () => ({
  color: "#FCE7FF",
  fontSize: 11,
  textTransform: "capitalize",
})

const $heroTitleRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
})

const $heroIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 42,
  height: 42,
  borderRadius: 16,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $heroTitle: ThemedStyle<TextStyle> = ({ typography }) => ({
  color: "#FFF8FF",
  fontFamily: typography.primary.medium,
  fontSize: 24,
  lineHeight: 28,
})

const $heroSubtitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,235,255,0.72)",
  fontSize: 12,
  marginTop: 3,
})

const $errorBanner: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  marginTop: spacing.md,
  paddingHorizontal: 10,
  paddingVertical: 9,
  borderRadius: 14,
  backgroundColor: "rgba(255, 102, 138, 0.12)",
  borderWidth: 1,
  borderColor: "rgba(255, 136, 170, 0.18)",
})

const $errorBannerText: ThemedStyle<TextStyle> = () => ({
  flex: 1,
  color: "#FFC5D4",
  fontSize: 12,
})

const $sectionCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.sm,
  marginBottom: spacing.xs,
  padding: spacing.md,
  borderRadius: 22,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  overflow: "hidden",
})

const $sectionHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: spacing.sm,
})

const $sectionHeaderLeft: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
})

const $sectionIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 28,
  height: 28,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $sectionTitle: ThemedStyle<TextStyle> = () => ({
  color: "#FAEDFF",
  fontSize: 13,
  fontWeight: "700",
})

const $sectionSubtitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,235,255,0.62)",
  fontSize: 11,
  marginTop: 2,
})

const $glassInput: ThemedStyle<ViewStyle> = () => ({
  minHeight: 46,
  borderRadius: 18,
  flexDirection: "row",
  alignItems: "flex-start",
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  overflow: "hidden",
})

const $glassInputIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 40,
  minHeight: 46,
  alignItems: "center",
  justifyContent: "center",
  paddingTop: 14,
})

const $glassInputField: ThemedStyle<TextStyle> = () => ({
  flex: 1,
  color: "#FFF6FF",
  fontSize: 13,
  paddingRight: 14,
  paddingVertical: 13,
})

const $inputGap: ThemedStyle<ViewStyle> = () => ({
  height: 10,
})

const $bodyInputWrap: ThemedStyle<ViewStyle> = () => ({
  minHeight: 160,
  alignItems: "flex-start",
})

const $titleInput: ThemedStyle<TextStyle> = () => ({
  fontSize: 14,
  fontWeight: "600",
})

const $bodyInput: ThemedStyle<TextStyle> = () => ({
  fontSize: 13,
  minHeight: 150,
  lineHeight: 18,
})

const $chipRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: 8,
})

const $chipPressable: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 999,
})

const $chip: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 8,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.1)",
})

const $chipSelected: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 8,
})

const $chipText: ThemedStyle<TextStyle> = () => ({
  color: "#F6E8FB",
  fontSize: 11,
  fontWeight: "600",
})

const $chipTextSelected: ThemedStyle<TextStyle> = () => ({
  color: "#1E0920",
  fontSize: 11,
  fontWeight: "700",
})

const $tinyMetaText: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,235,255,0.58)",
  fontSize: 11,
})

const $emptyAttachmentState: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: spacing.lg,
})

const $emptyAttachmentIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 46,
  height: 46,
  borderRadius: 16,
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 10,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $emptyAttachmentTitle: ThemedStyle<TextStyle> = () => ({
  color: "#FFF1FF",
  fontSize: 13,
  fontWeight: "700",
})

const $emptyAttachmentSubtitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,235,255,0.62)",
  fontSize: 11,
  marginTop: 4,
  textAlign: "center",
  maxWidth: 240,
})

const $attachmentList: ThemedStyle<ViewStyle> = () => ({
  gap: 8,
})

const $attachmentCard: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  borderRadius: 18,
  padding: 10,
  backgroundColor: "rgba(255,255,255,0.045)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.07)",
})

const $attachmentPlaceholder: ThemedStyle<ViewStyle> = () => ({
  width: 48,
  height: 48,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $attachmentImage: ThemedStyle<ImageStyle> = () => ({
  width: 48,
  height: 48,
  borderRadius: 14,
})

const $attachmentBody: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  marginLeft: 10,
  marginRight: 8,
})

const $attachmentName: ThemedStyle<TextStyle> = () => ({
  color: "#FFF1FF",
  fontSize: 12,
  fontWeight: "700",
})

const $attachmentMeta: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,235,255,0.62)",
  fontSize: 10,
  marginTop: 3,
})

const $attachmentError: ThemedStyle<TextStyle> = () => ({
  color: "#FFB5C8",
  fontSize: 10,
  marginTop: 4,
})

const $attachmentButton: ThemedStyle<ViewStyle> = () => ({
  height: 34,
  minWidth: 58,
  paddingHorizontal: 12,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.07)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.1)",
})

const $attachmentButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#FFF0FF",
  fontSize: 11,
  fontWeight: "700",
})

const $quickActionGrid: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  gap: 8,
  marginTop: 12,
})

const $miniActionButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 56,
  borderRadius: 18,
  paddingHorizontal: 10,
  paddingVertical: 10,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.055)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $miniActionIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 26,
  height: 26,
  borderRadius: 9,
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 6,
  backgroundColor: "rgba(255,255,255,0.06)",
})

const $miniActionText: ThemedStyle<TextStyle> = () => ({
  color: "#FFF0FF",
  fontSize: 11,
  fontWeight: "700",
})

const $disabledButton: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.45,
})

const $buttonBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.md,
})

const $primaryButton: ThemedStyle<ViewStyle> = () => ({
  minHeight: 50,
  borderRadius: 18,
  overflow: "hidden",
  justifyContent: "center",
  shadowColor: "#E167FF",
  shadowOpacity: 0.35,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 10 },
})

const $buttonSheen: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  inset: 0,
})

const $primaryButtonContent: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
})

const $primaryButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#220826",
  fontSize: 13,
  fontWeight: "800",
})

const $ghostButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 50,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
  marginTop: spacing.sm,
  backgroundColor: "rgba(255,255,255,0.055)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.09)",
})

const $dangerButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 50,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
  marginTop: spacing.sm,
  backgroundColor: "rgba(255, 111, 145, 0.08)",
  borderWidth: 1,
  borderColor: "rgba(255, 145, 172, 0.18)",
})

const $ghostButtonContent: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
})

const $ghostButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#FFF0FF",
  fontSize: 13,
  fontWeight: "700",
})

const $dangerButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#FFB5C7",
  fontSize: 13,
  fontWeight: "700",
})

const $trashedActions: ThemedStyle<ViewStyle> = () => ({
  gap: 8,
})
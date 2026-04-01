import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Alert,
  AppState,
  Image,
  ImageStyle,
  Pressable,
  ScrollView,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import * as DocumentPicker from "expo-document-picker"
import * as FileSystem from "expo-file-system/legacy"
import * as Sharing from "expo-sharing"
import { Audio, AVPlaybackStatus } from "expo-av"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated"
import {
  Download,
  FileText,
  Image as LucideImage,
  LockKeyhole,
  Mic,
  NotebookPen,
  Paperclip,
  Save,
  Shield,
  Trash2,
  Upload,
} from "lucide-react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { SecureItemViewerModal } from "@/components/vault/SecureItemViewerModal"
import { VaultHubBackground } from "@/components/VaultHubBackground"
import { AttachmentRow } from "@/components/vault-note/AttachmentRow"
import { EmptyAttachmentState } from "@/components/vault-note/EmptyAttachmentState"
import { GhostButton } from "@/components/vault-note/GhostButton"
import { GhostDangerButton } from "@/components/vault-note/GhostDangerButton"
import { GlassChip } from "@/components/vault-note/GlassChip"
import { GlassSection } from "@/components/vault-note/GlassSection"
import { GradientPrimaryButton } from "@/components/vault-note/GradientPrimaryButton"
import { HeroCard } from "@/components/vault-note/HeroCard"
import { IconTextInput } from "@/components/vault-note/IconTextInput"
import { ImageAttachmentCard } from "@/components/vault-note/ImageAttachmentCard"
import { MetaChip } from "@/components/vault-note/MetaChip"
import { MiniIconButton } from "@/components/vault-note/MiniIconButton"
import { VoiceStudioCard } from "@/components/vault-note/VoiceStudioCard"
import type { VaultStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import {
  deleteNote,
  getNote,
  listNoteIds,
  moveNoteToTrash,
  Note,
  NoteAttachment,
  restoreNote,
  saveNote,
} from "@/locker/storage/notesRepo"
import { getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo"
import { base64ToBytes, bytesToBase64, bytesToUtf8, utf8ToBytes } from "@/locker/crypto/encoding"
import { randomBytes } from "@/locker/crypto/random"
import {
  buildAttachmentBlobBytes,
  buildAttachmentBlobId,
  generateAttachmentId,
  parseAttachmentBlobBytes,
} from "@/locker/attachments/attachmentCodec"
import {
  AttachmentCacheUnavailableError,
  deleteEncryptedAttachment,
  readEncryptedAttachment,
  writeEncryptedAttachment,
} from "@/locker/attachments/attachmentCache"
import { sha256Hex } from "@/locker/crypto/sha"
import {
  enqueueUpdateIndexData,
  enqueueUpsertAttachmentBlob,
  enqueueUpsertNoteData,
} from "@/locker/sync/queue"
import { getAccount } from "@/locker/storage/accountRepo"
import { requestSync } from "@/locker/sync/syncCoordinator"
import { fetchRaw } from "@/locker/net/apiClient"
import { getToken } from "@/locker/auth/tokenStore"
import {
  DEFAULT_VAULT_CLASSIFICATION,
  getVaultItemLabel,
  getVaultItemTypeFromImportType,
  getVaultItemTypeFromMime,
  VAULT_CLASSIFICATIONS,
  VaultClassification,
  VaultImportType,
  VaultItemType,
} from "@/locker/vault/types"
import { ensureElevatedSession } from "@/locker/security/stepUp"
import { useBackgroundLockSuppression } from "@/locker/security/backgroundLockSuppression"
import { recordSecurityEvent } from "@/locker/security/auditLogRepo"
import { MAX_BLOB_BYTES } from "@/locker/constants"

type AttachmentUiState = {
  status: "idle" | "downloading" | "ready" | "error" | "corrupt"
  dataUri?: string
  localUri?: string
  previewText?: string
  filename?: string
  mime?: string
  error?: string
}

type ViewerState = {
  visible: boolean
  title: string
  subtitle?: string
  itemType: VaultItemType
  sourceUri?: string
  dataUri?: string
  html?: string
  imageItems?: Array<{ id: string; title: string; uri: string }>
  initialImageIndex?: number
  fallbackMessage?: string
}

const LOCAL_ATTACHMENT_SCOPE = "__local__"
const VOICE_MIME = "audio/m4a"

function debugVoiceFlow(event: string, payload: Record<string, unknown>) {
  if (!__DEV__) return
  console.log(`[voice-flow] ${event}`, payload)
}

function resolveExistingAttachmentId(
  attachments: NoteAttachment[],
  ...preferredIds: Array<string | null | undefined>
): string | null {
  for (const candidate of preferredIds) {
    if (candidate && attachments.some((attachment) => attachment.id === candidate)) return candidate
  }
  return attachments[0]?.id ?? null
}

function isVoiceMimeAttachmentList(attachments: NoteAttachment[]): boolean {
  return attachments.length > 0 && attachments.every((attachment) => getVaultItemTypeFromMime(attachment.mime) === "voice")
}

function shouldPrepareVoiceAttachment(
  attachment: NoteAttachment | null,
  state: AttachmentUiState | undefined,
): boolean {
  if (!attachment) return false
  if (getVaultItemTypeFromMime(attachment.mime) !== "voice") return false
  if (!state) return true
  if (state.status === "ready" && state.localUri) return false
  if (state.status === "downloading") return false
  return true
}

const fileSystemCompat = FileSystem as any

export const VaultNoteScreen: FC<VaultStackScreenProps<"VaultNote">> = function VaultNoteScreen(
  props,
) {
  const { navigation, route } = props
  const { themed, theme } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])
  useBackgroundLockSuppression("VaultNoteScreen")

  const noteId = route.params?.noteId
  const importType = route.params?.importType
  const requestedType = route.params?.createType ?? (importType ? getVaultItemTypeFromImportType(importType) : "note")

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [vaultId, setVaultId] = useState<string | null>(null)
  const [classification, setClassification] = useState<VaultClassification>(
    DEFAULT_VAULT_CLASSIFICATION,
  )
  const [deletedAt, setDeletedAt] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<NoteAttachment[]>([])
  const [attachmentStates, setAttachmentStates] = useState<Record<string, AttachmentUiState>>({})
  const [error, setError] = useState<string | null>(null)
  const [isExisting, setIsExisting] = useState(false)
  const [itemType, setItemType] = useState<VaultItemType>(requestedType)
  const [primaryAttachmentId, setPrimaryAttachmentId] = useState<string | null>(null)
  const [voiceDurationMs, setVoiceDurationMs] = useState<number | null>(null)
  const [activeAttachmentId, setActiveAttachmentId] = useState<string | null>(route.params?.attachmentId ?? null)
  const [viewer, setViewer] = useState<ViewerState>({
    visible: false,
    title: "",
    itemType: "note",
  })
  const [isExporting, setIsExporting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isRecordingPaused, setIsRecordingPaused] = useState(false)
  const [recordingDurationMs, setRecordingDurationMs] = useState(0)
  const [isSavingVoice, setIsSavingVoice] = useState(false)
  const [isPlayingVoice, setIsPlayingVoice] = useState(false)
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0)

  const recordingRef = useRef<Audio.Recording | null>(null)
  const soundRef = useRef<Audio.Sound | null>(null)
  const soundAttachmentIdRef = useRef<string | null>(null)
  const pulse = useSharedValue(1)

  const attachmentScope = vaultId ?? LOCAL_ATTACHMENT_SCOPE
  const canEdit = true
  const selectedAttachmentId = resolveExistingAttachmentId(
    attachments,
    activeAttachmentId,
    route.params?.attachmentId ?? null,
    primaryAttachmentId,
  )

  const selectedAttachment = useMemo(() => {
    return selectedAttachmentId
      ? attachments.find((attachment) => attachment.id === selectedAttachmentId) ?? null
      : null
  }, [attachments, selectedAttachmentId])
  const selectedVoiceAttachment = useMemo(() => {
    if (!isVoiceMimeAttachmentList(attachments)) return null
    return (
      selectedAttachment ??
      (primaryAttachmentId
        ? attachments.find((attachment) => attachment.id === primaryAttachmentId) ?? null
        : null) ??
      attachments[0] ??
      null
    )
  }, [attachments, primaryAttachmentId, selectedAttachment])
  const selectedVoiceDurationMs = selectedVoiceAttachment?.durationMs ?? voiceDurationMs
  const selectedVoiceState = selectedVoiceAttachment
    ? attachmentStates[selectedVoiceAttachment.id]
    : undefined

  const lockedAttachmentType = useMemo<VaultItemType | null>(() => {
    if (attachments.length > 0) return getVaultItemTypeFromMime(attachments[0].mime)
    if (itemType === "image" || itemType === "pdf" || itemType === "doc") return itemType
    if (itemType === "voice") return "voice"
    return null
  }, [attachments, itemType])

  const effectiveItemType = useMemo<VaultItemType>(() => {
    if (lockedAttachmentType) return lockedAttachmentType
    if (selectedAttachment) return getVaultItemTypeFromMime(selectedAttachment.mime)
    return itemType
  }, [itemType, lockedAttachmentType, selectedAttachment])

  const isFileFirstItem =
    effectiveItemType === "image" || effectiveItemType === "pdf" || effectiveItemType === "doc"
  const isVoiceItem = effectiveItemType === "voice"
  const saveLabel = noteId ? "Update Secure Item" : "Save Secure Item"
  const titleTrimmed = title.trim()
  const bodyTrimmed = body.trim()
  const validationMessage = useMemo(() => {
    if (isVoiceItem) return attachments.length === 0 ? "Record or import a voice attachment first." : null
    if (isFileFirstItem) return attachments.length === 0 ? "Add at least one attachment before saving." : null
    if (!titleTrimmed && !bodyTrimmed && attachments.length === 0) {
      return "Add a title or note content before saving."
    }
    return null
  }, [attachments.length, bodyTrimmed, isFileFirstItem, isVoiceItem, titleTrimmed])
  const canSaveItem = !validationMessage

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }))

  const loadNote = useCallback(() => {
    const key = vaultSession.getKey()
    if (!key || !noteId) return
    try {
      const note = getNote(noteId, key)
      hydrateFromNote(note)
      setIsExisting(true)
      setError(null)
    } catch {
      setError("Vault data error")
    }
  }, [noteId])

  const hydrateFromNote = useCallback(
    (note: Note) => {
      const inferredItemType = inferItemTypeFromNote(note)
      const nextAttachments = note.attachments ?? []
      const nextPrimaryAttachmentId = resolveExistingAttachmentId(
        nextAttachments,
        note.primaryAttachmentId ?? null,
      )
      setTitle(note.title)
      setBody(note.body)
      setVaultId(note.vaultId ?? null)
      setClassification(note.classification ?? DEFAULT_VAULT_CLASSIFICATION)
      setDeletedAt(note.deletedAt ?? null)
      setAttachments(nextAttachments)
      setItemType(inferredItemType)
      setPrimaryAttachmentId(nextPrimaryAttachmentId)
      setVoiceDurationMs(note.voiceDurationMs ?? null)
      const routeAttachmentId = route.params?.attachmentId ?? null
      setActiveAttachmentId(
        resolveExistingAttachmentId(nextAttachments, routeAttachmentId, nextPrimaryAttachmentId),
      )
    },
    [route.params?.attachmentId],
  )

  const syncSavedAttachmentNote = useCallback(
    async (
      saved: Note,
      blobs: Array<{ attachmentId: string; bytes: Uint8Array }>,
      vaultKey: Uint8Array,
    ) => {
      const deviceId = getAccount()?.device.id
      if (!deviceId || !saved.vaultId) return
      enqueueUpdateIndexData(listNoteIds(saved.vaultId), saved.vaultId, vaultKey, deviceId)
      enqueueUpsertNoteData(saved, saved.vaultId, vaultKey, deviceId)
      blobs.forEach((blob) => {
        enqueueUpsertAttachmentBlob({
          vaultId: saved.vaultId!,
          bytes: blob.bytes,
          noteId: saved.id,
          attId: blob.attachmentId,
        })
      })
      await requestSync("note_change", saved.vaultId)
    },
    [],
  )

  const syncSavedNoteOnly = useCallback(async (saved: Note) => {
    const deviceId = getAccount()?.device.id
    if (!deviceId || !saved.vaultId) return
    const vaultKey = await getRemoteVaultKey(saved.vaultId)
    if (!vaultKey) return
    enqueueUpdateIndexData(listNoteIds(saved.vaultId), saved.vaultId, vaultKey, deviceId)
    enqueueUpsertNoteData(saved, saved.vaultId, vaultKey, deviceId)
    await requestSync("note_change", saved.vaultId)
  }, [])

  const writeTempFile = useCallback(async (filename: string, bytes: Uint8Array) => {
    const dir = `${fileSystemCompat.cacheDirectory ?? fileSystemCompat.documentDirectory ?? ""}locker/open`
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
    const safeName = filename.replace(/[\\/]/g, "_")
    const path = `${dir}/${Date.now()}-${safeName}`
    await FileSystem.writeAsStringAsync(path, bytesToBase64(bytes), {
      encoding: fileSystemCompat.EncodingType.Base64,
    })
    return path
  }, [])

  const unloadVoiceSound = useCallback(async () => {
    const sound = soundRef.current
    soundRef.current = null
    soundAttachmentIdRef.current = null
    if (sound) {
      await sound.unloadAsync().catch(() => undefined)
    }
    setPlaybackPositionMs(0)
    setIsPlayingVoice(false)
  }, [])

  const resolveAttachmentKeyContext = useCallback(
    async (targetVaultId: string | null, options?: { preferRemote?: boolean }) => {
      const sessionKey = vaultSession.getKey()
      if (!sessionKey) return null

      if (options?.preferRemote && targetVaultId) {
        const remoteKey = await getRemoteVaultKey(targetVaultId)
        if (remoteKey) {
          return {
            key: remoteKey,
            syncKey: remoteKey,
            scope: targetVaultId,
            mode: "remote" as const,
          }
        }
      }

      return {
        key: sessionKey,
        syncKey: null,
        scope: targetVaultId ?? LOCAL_ATTACHMENT_SCOPE,
        mode: "local" as const,
      }
    },
    [],
  )

  const resolveAttachment = useCallback(
    async (att: NoteAttachment, options?: { silent?: boolean }) => {
      const existingState = attachmentStates[att.id]
      if (existingState?.status === "ready" && existingState.localUri) return existingState
      if (existingState?.status === "downloading") return existingState

      const context = await resolveAttachmentKeyContext(vaultId, {
        preferRemote: Boolean(noteId && isExisting && vaultId),
      })
      if (!context?.key) {
        if (!options?.silent) setError("Missing attachment key")
        return null
      }

      setAttachmentStates((prev) => ({ ...prev, [att.id]: { status: "downloading" } }))

      try {
        const isVoiceAttachment = getVaultItemTypeFromMime(att.mime) === "voice"
        if (isVoiceAttachment) {
          debugVoiceFlow("resolve:start", {
            noteId,
            vaultId,
            attId: att.id,
            blobId: att.blobId,
            mime: att.mime,
            scope: context.scope,
            mode: context.mode,
          })
        }

        let encryptedBytes = await readEncryptedAttachment(context.scope, att.id)
        if (isVoiceAttachment) {
          debugVoiceFlow("resolve:cache-read", {
            attId: att.id,
            scope: context.scope,
            cacheHit: !!encryptedBytes,
          })
        }
        if (!encryptedBytes) {
          if (!vaultId || !context.syncKey) throw new Error("Attachment not cached on this device")
          const token = await getToken()
          if (!token) throw new Error("Link device first")
          encryptedBytes = await fetchRaw(`/v1/vaults/${vaultId}/blobs/${att.blobId}`, {}, { token })
          await writeEncryptedAttachment(context.scope, att.id, encryptedBytes)
          if (isVoiceAttachment) {
            debugVoiceFlow("resolve:fetched-remote", {
              attId: att.id,
              scope: context.scope,
              bytes: encryptedBytes.length,
            })
          }
        }

        if (att.sha256 && sha256Hex(encryptedBytes) !== att.sha256) {
          const nextState: AttachmentUiState = { status: "corrupt", error: "Integrity check failed" }
          setAttachmentStates((prev) => ({ ...prev, [att.id]: nextState }))
          return nextState
        }

        const payload = parseAttachmentBlobBytes(encryptedBytes, context.key)
        if (payload.attId !== att.id) throw new Error("Attachment mismatch")
        if (isVoiceAttachment) {
          debugVoiceFlow("resolve:parsed", {
            attId: att.id,
            payloadAttId: payload.attId,
            payloadMime: payload.mime,
            payloadNoteId: payload.noteId,
          })
        }

        const filename = payload.filename ?? att.filename ?? `${effectiveItemType}-${att.id}`
        const localUri = await writeTempFile(filename, payload.fileBytes)
        const state: AttachmentUiState = {
          status: "ready",
          filename,
          localUri,
          mime: payload.mime,
          dataUri: payload.mime.startsWith("image/")
            ? `data:${payload.mime};base64,${bytesToBase64(payload.fileBytes)}`
            : undefined,
          previewText: isTextMime(payload.mime) ? bytesToUtf8(payload.fileBytes).slice(0, 4000) : undefined,
        }

        setAttachmentStates((prev) => ({ ...prev, [att.id]: state }))
        if (isVoiceAttachment) {
          debugVoiceFlow("resolve:ready", {
            attId: att.id,
            localUri,
            filename,
          })
        }
        return state
      } catch (err) {
        const message = err instanceof Error ? err.message : "Attachment download failed"
        const nextState: AttachmentUiState = { status: "error", error: message }
        setAttachmentStates((prev) => ({ ...prev, [att.id]: nextState }))
        if (getVaultItemTypeFromMime(att.mime) === "voice") {
          debugVoiceFlow("resolve:error", {
            attId: att.id,
            blobId: att.blobId,
            vaultId,
            message,
          })
        }
        if (!options?.silent) setError(message)
        return null
      }
    },
    [attachmentStates, effectiveItemType, isExisting, noteId, resolveAttachmentKeyContext, vaultId, writeTempFile],
  )

  const exportCurrentItem = useCallback(async () => {
    setIsExporting(true)
    try {
      const canShare = await Sharing.isAvailableAsync()
      if (!canShare) throw new Error("Sharing is not available on this device.")

      if (effectiveItemType === "note") {
        const exportPath = await writeTempFile(
          `${(title || "secure-note").replace(/[\\/]/g, "_")}.txt`,
          utf8ToBytes(body || ""),
        )
        await Sharing.shareAsync(exportPath, { mimeType: "text/plain" })
        return
      }

      const exportAttachment = isVoiceItem ? selectedVoiceAttachment : selectedAttachment
      if (isVoiceItem) {
        debugVoiceFlow("export:start", {
          selectedAttachmentId,
          resolvedAttId: exportAttachment?.id ?? null,
          blobId: exportAttachment?.blobId ?? null,
          mime: exportAttachment?.mime ?? null,
        })
      }
      if (!exportAttachment) throw new Error("No attachment available to export")
      const prepared = await resolveAttachment(exportAttachment)
      if (!prepared || !prepared.localUri) throw new Error("Export file unavailable")
      await Sharing.shareAsync(prepared.localUri, { mimeType: prepared.mime ?? exportAttachment.mime })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setIsExporting(false)
    }
  }, [body, effectiveItemType, isVoiceItem, resolveAttachment, selectedAttachment, selectedVoiceAttachment, title, writeTempFile])

  const openAttachmentViewer = useCallback(
    async (attachment: NoteAttachment) => {
      setActiveAttachmentId(attachment.id)

      if (getVaultItemTypeFromMime(attachment.mime) === "image") {
        const preparedImages = await Promise.all(
          attachments.map(async (item) => ({
            attachment: item,
            prepared: await resolveAttachment(item, { silent: true }),
          })),
        )
        const imageItems = preparedImages
          .filter(
            (entry): entry is { attachment: NoteAttachment; prepared: AttachmentUiState } =>
              !!entry.prepared?.dataUri || !!entry.prepared?.localUri,
          )
          .map((entry) => ({
            id: entry.attachment.id,
            title: entry.attachment.filename ?? "Secure image",
            uri: entry.prepared.dataUri ?? entry.prepared.localUri ?? "",
          }))

        const initialImageIndex = Math.max(
          0,
          imageItems.findIndex((item) => item.id === attachment.id),
        )

        setViewer({
          visible: true,
          title: getVaultItemLabel("image"),
          subtitle: `${imageItems.length} secure image${imageItems.length === 1 ? "" : "s"}`,
          itemType: "image",
          imageItems,
          initialImageIndex,
        })
        return
      }

      const prepared = await resolveAttachment(attachment)
      if (!prepared || !prepared.localUri) return
      const attachmentType = getVaultItemTypeFromMime(attachment.mime)

      setViewer({
        visible: true,
        title: attachment.filename ?? getVaultItemLabel(attachmentType),
        subtitle: [formatBytes(attachment.sizeBytes), attachment.mime].join(" · "),
        itemType: attachmentType,
        sourceUri: prepared.localUri,
        dataUri: prepared.dataUri,
        html:
          attachmentType === "doc" && prepared.previewText
            ? buildTextViewerHtml(prepared.previewText, attachment.filename ?? "Secure document")
            : undefined,
        fallbackMessage:
          attachmentType === "doc"
            ? "This document format cannot be rendered natively here. Export remains available from the secure viewer."
            : undefined,
      })
    },
    [attachments, resolveAttachment],
  )

  const handleSave = useCallback(() => {
    const key = vaultSession.getKey()
    if (!key) return
    if (validationMessage) {
      setError(validationMessage)
      return
    }
    const persistedPrimaryAttachmentId = resolveExistingAttachmentId(attachments, primaryAttachmentId)
    const persistedVoiceDurationMs = isVoiceItem
      ? attachments.find((attachment) => attachment.id === persistedPrimaryAttachmentId)?.durationMs ?? null
      : voiceDurationMs
    const saved = saveNote(
      {
        id: noteId,
        title: titleTrimmed,
        body,
        classification,
        itemType,
        primaryAttachmentId: persistedPrimaryAttachmentId,
        voiceDurationMs: persistedVoiceDurationMs,
        deletedAt,
        vaultId,
        attachments,
      },
      key,
    )
    if (saved.vaultId) {
      void syncSavedNoteOnly(saved)
    }
    navigation.goBack()
  }, [
    attachments,
    body,
    classification,
    deletedAt,
    itemType,
    navigation,
    noteId,
    primaryAttachmentId,
    syncSavedNoteOnly,
    titleTrimmed,
    validationMessage,
    vaultId,
    voiceDurationMs,
    isVoiceItem,
  ])

  const handleMoveToTrash = useCallback(() => {
    if (!noteId) return
    const key = vaultSession.getKey()
    if (!key) return
    try {
      const saved = moveNoteToTrash(noteId, key)
      if (!saved) return
      setDeletedAt(saved.deletedAt ?? null)
      setError(null)
    } catch {
      setError("Failed to move item to trash")
    }
  }, [noteId])

  const handleRestore = useCallback(() => {
    if (!noteId) return
    const key = vaultSession.getKey()
    if (!key) return
    try {
      const saved = restoreNote(noteId, key)
      if (!saved) return
      setDeletedAt(saved.deletedAt ?? null)
      setError(null)
    } catch {
      setError("Failed to restore item")
    }
  }, [noteId])

  const handlePermanentDelete = useCallback(() => {
    if (!noteId) return
    const key = vaultSession.getKey()
    if (!key) return
    void (async () => {
      try {
        await ensureElevatedSession("permanent delete")
        for (const attachment of attachments) {
          await deleteEncryptedAttachment(attachmentScope, attachment.id)
        }
        deleteNote(noteId, key ?? undefined)
        recordSecurityEvent({
          type: "secure_delete",
          message: "Permanent delete completed for a vault item.",
          severity: "warning",
          meta: { noteId },
        })
        navigation.goBack()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Step-up required"
        setError(message)
      }
    })()
  }, [attachmentScope, attachments, navigation, noteId])

  const handleImportAttachment = useCallback(
    async (kind: VaultImportType) => {
      try {
        if (!vaultSession.isUnlocked()) return
        if (!canEdit) {
          setError("This item is read-only right now")
          return
        }

        const vmk = vaultSession.getKey()
        if (!vmk) return

        const picked = await DocumentPicker.getDocumentAsync({
          multiple: true,
          copyToCacheDirectory: true,
          type:
            kind === "image"
              ? "image/*"
              : kind === "pdf"
                ? "application/pdf"
                : kind === "voice"
                  ? "audio/*"
                  : "*/*",
        })
        if (picked.canceled) return

        const pickedAssets = picked.assets?.filter((asset) => !!asset.uri) ?? []
        if (pickedAssets.length === 0) return

        const firstType = getVaultItemTypeFromMime(
          pickedAssets[0]?.mimeType ?? "application/octet-stream",
        )
        const nextLockedType = lockedAttachmentType ?? firstType

        if (nextLockedType === "voice") {
          setError("Voice items only accept secure voice recordings.")
          return
        }

        if (isFileFirstItem && lockedAttachmentType && lockedAttachmentType !== firstType) {
          setError(`This secure item only accepts ${getFamilyLabel(lockedAttachmentType)} attachments.`)
          return
        }

        if (!pickedAssets.every((asset) => getVaultItemTypeFromMime(asset.mimeType ?? "application/octet-stream") === nextLockedType)) {
          setError(`All attachments in this item must be ${getFamilyLabel(nextLockedType)} files.`)
          return
        }

        if (kind === "image" && nextLockedType !== "image") {
          setError("Only image attachments can be added here.")
          return
        }
        if (kind === "pdf" && nextLockedType !== "pdf") {
          setError("Only PDF attachments can be added here.")
          return
        }
        if (kind === "file" && nextLockedType !== "doc") {
          setError(`This secure item only accepts ${getFamilyLabel(nextLockedType)} files.`)
          return
        }

        const nextVaultId = noteId ? vaultId : (vaultId ?? getRemoteVaultId())
        const nextNoteId = noteId ?? generateVaultNoteId()
        const keyContext = await resolveAttachmentKeyContext(nextVaultId, {
          preferRemote: Boolean(noteId && isExisting && nextVaultId),
        })
        if (!keyContext?.key) {
          setError("Missing attachment key for this item")
          return
        }

        const newAttachments: NoteAttachment[] = []
        const queuedBlobs: Array<{ attachmentId: string; bytes: Uint8Array }> = []
        const nextAttachmentStates: Record<string, AttachmentUiState> = {}

        for (const asset of pickedAssets) {
          const fileBase64 = await FileSystem.readAsStringAsync(asset.uri!, {
            encoding: fileSystemCompat.EncodingType.Base64,
          })
          const fileBytes = base64ToBytes(fileBase64)
          if (fileBytes.length > MAX_BLOB_BYTES) {
            setError(`Attachment exceeds ${formatBytes(MAX_BLOB_BYTES)} limit`)
            return
          }

          const mime = asset.mimeType ?? "application/octet-stream"
          const attId = generateAttachmentId()
          const blobBytes = buildAttachmentBlobBytes({
            rvk: keyContext.key,
            noteId: nextNoteId,
            attId,
            fileBytes,
            filename: asset.name ?? null,
            mime,
          })

          const record: NoteAttachment = {
            id: attId,
            filename: asset.name ?? null,
            mime,
            sizeBytes: fileBytes.length,
            sha256: sha256Hex(blobBytes),
            blobId: buildAttachmentBlobId(nextNoteId, attId),
            createdAt: new Date().toISOString(),
          }

          await writeEncryptedAttachment(keyContext.scope, attId, blobBytes)
          newAttachments.push(record)
          queuedBlobs.push({ attachmentId: attId, bytes: blobBytes })
          nextAttachmentStates[attId] = {
            status: "ready",
            localUri: asset.uri,
            mime,
            filename: asset.name ?? undefined,
            dataUri: mime.startsWith("image/") ? `data:${mime};base64,${fileBase64}` : undefined,
          }
        }

        const nextAttachments = [...attachments, ...newAttachments]
        const nextPrimaryAttachmentId = primaryAttachmentId ?? newAttachments[0]?.id ?? attachments[0]?.id ?? null
        const saved = saveNote(
          {
            id: nextNoteId,
            title:
              titleTrimmed ||
              stripExtension(pickedAssets[0]?.name) ||
              getVaultItemLabel(nextLockedType),
            body: "",
            classification,
            itemType: nextLockedType,
            deletedAt,
            vaultId: nextVaultId,
            attachments: nextAttachments,
            primaryAttachmentId: nextPrimaryAttachmentId,
            voiceDurationMs: null,
          },
          vmk,
          { suppressSync: true },
        )

        hydrateFromNote(saved)
        setAttachmentStates((prev) => ({ ...prev, ...nextAttachmentStates }))
        setIsExisting(true)
        setError(null)

        if (saved.vaultId && keyContext.syncKey) {
          await syncSavedAttachmentNote(saved, queuedBlobs, keyContext.syncKey)
        }

        if (!noteId) {
          navigation.replace("VaultNote", {
            noteId: saved.id,
            attachmentId: nextPrimaryAttachmentId ?? undefined,
          })
        }
      } catch (err) {
        const message =
          err instanceof AttachmentCacheUnavailableError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Attachment import failed"
        setError(message)
      }
    },
    [
      attachments,
      canEdit,
      classification,
      deletedAt,
      hydrateFromNote,
      isFileFirstItem,
      lockedAttachmentType,
      navigation,
      noteId,
      primaryAttachmentId,
      resolveAttachmentKeyContext,
      syncSavedAttachmentNote,
      titleTrimmed,
      vaultId,
    ],
  )

  const persistVoiceRecording = useCallback(
    async (uri: string, durationMs: number) => {
      setIsSavingVoice(true)
      try {
        const vmk = vaultSession.getKey()
        if (!vmk) return

        const fileBytes = base64ToBytes(await FileSystem.readAsStringAsync(uri, {
          encoding: fileSystemCompat.EncodingType.Base64,
        }))
        if (fileBytes.length > MAX_BLOB_BYTES) {
          setError(`Recording exceeds ${formatBytes(MAX_BLOB_BYTES)} limit`)
          return
        }

        const nextVaultId = noteId ? vaultId : (vaultId ?? getRemoteVaultId())
        const nextNoteId = noteId ?? generateVaultNoteId()
        const keyContext = await resolveAttachmentKeyContext(nextVaultId, {
          preferRemote: Boolean(nextVaultId),
        })
        if (!keyContext?.key) {
          setError("Missing attachment key for voice item")
          return
        }

        const attId = generateAttachmentId()
        const filename = `${(title.trim() || "voice-recording").replace(/[\\/]/g, "_")}.m4a`
        const blobBytes = buildAttachmentBlobBytes({
          rvk: keyContext.key,
          noteId: nextNoteId,
          attId,
          fileBytes,
          filename,
          mime: VOICE_MIME,
        })

        const record: NoteAttachment = {
          id: attId,
          filename,
          mime: VOICE_MIME,
          sizeBytes: fileBytes.length,
          sha256: sha256Hex(blobBytes),
          blobId: buildAttachmentBlobId(nextNoteId, attId),
          createdAt: new Date().toISOString(),
          durationMs,
        }

        debugVoiceFlow("persist:before-write", {
          noteId: nextNoteId,
          vaultId: nextVaultId,
          attId,
          blobId: record.blobId,
          scope: keyContext.scope,
          mode: keyContext.mode,
          durationMs,
        })
        await writeEncryptedAttachment(keyContext.scope, attId, blobBytes)
        const nextAttachments = [...attachments, record]
        const nextPrimaryAttachmentId = resolveExistingAttachmentId(
          nextAttachments,
          primaryAttachmentId,
          attachments[0]?.id ?? null,
          record.id,
        )

        const saved = saveNote(
          {
            id: nextNoteId,
            title: title.trim() || "Voice recording",
            body: "",
            classification,
            itemType: "voice",
            primaryAttachmentId: nextPrimaryAttachmentId,
            voiceDurationMs:
              nextAttachments.find((attachment) => attachment.id === nextPrimaryAttachmentId)?.durationMs ?? null,
            deletedAt,
            vaultId: nextVaultId,
            attachments: nextAttachments,
          },
          vmk,
          { suppressSync: true },
        )

        hydrateFromNote(saved)
        setActiveAttachmentId(attId)
        setVoiceDurationMs(durationMs)
        setAttachmentStates((prev) => ({
          ...prev,
          [attId]: {
            status: "ready",
            localUri: uri,
            mime: VOICE_MIME,
            filename,
          },
        }))
        debugVoiceFlow("persist:after-save", {
          savedNoteId: saved.id,
          savedVaultId: saved.vaultId ?? null,
          attId,
          blobId: record.blobId,
          primaryAttachmentId: saved.primaryAttachmentId ?? null,
          activeAttachmentId: attId,
          attachments: (saved.attachments ?? []).map((attachment) => ({
            id: attachment.id,
            blobId: attachment.blobId,
            mime: attachment.mime,
          })),
        })
        setIsExisting(true)
        setError(null)

        if (saved.vaultId && keyContext.syncKey) {
          await syncSavedAttachmentNote(saved, [{ attachmentId: attId, bytes: blobBytes }], keyContext.syncKey)
        }

        if (!noteId) {
          navigation.replace("VaultNote", {
            noteId: saved.id,
            createType: "voice",
            attachmentId: attId,
          })
        }
      } catch (err) {
        const message =
          err instanceof AttachmentCacheUnavailableError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Voice attachment storage failed"
        setError(message)
      } finally {
        setIsSavingVoice(false)
      }
    },
    [
      attachments,
      classification,
      deletedAt,
      hydrateFromNote,
      isExisting,
      navigation,
      noteId,
      primaryAttachmentId,
      resolveAttachmentKeyContext,
      syncSavedAttachmentNote,
      title,
      vaultId,
    ],
  )

  const startRecording = useCallback(async () => {
    try {
      if (!canEdit) throw new Error("This item is read-only right now")
      if (recordingRef.current) return
      const permission = await Audio.requestPermissionsAsync()
      if (!permission.granted) throw new Error("Microphone permission denied")
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      })

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status: any) => {
          if (!status.isRecording) return
          setRecordingDurationMs(status.durationMillis ?? 0)
        },
      )

      recordingRef.current = recording
      setIsRecording(true)
      setIsRecordingPaused(false)
      pulse.value = withRepeat(withSequence(withTiming(1.06, { duration: 1000 }), withTiming(0.94, { duration: 1000 })), -1, true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start recording")
    }
  }, [canEdit, pulse])

  const pauseOrResumeRecording = useCallback(async () => {
    try {
      const recording = recordingRef.current
      if (!recording) return
      if (isRecordingPaused) {
        await recording.startAsync()
        setIsRecordingPaused(false)
      } else {
        await recording.pauseAsync()
        setIsRecordingPaused(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update recording")
    }
  }, [isRecordingPaused])

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current
    if (!recording) return
    try {
      setIsSavingVoice(true)
      const status = await recording.stopAndUnloadAsync()
      const uri = recording.getURI()
      recordingRef.current = null
      setIsRecording(false)
      setIsRecordingPaused(false)
      pulse.value = withTiming(1, { duration: 180 })
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      })
      if (uri) {
        await persistVoiceRecording(uri, status.durationMillis ?? recordingDurationMs)
      } else {
        setIsSavingVoice(false)
      }
      setRecordingDurationMs(0)
    } catch (err) {
      setIsSavingVoice(false)
      setError(err instanceof Error ? err.message : "Unable to finish recording")
    }
  }, [persistVoiceRecording, pulse, recordingDurationMs])

  const stopVoicePlayback = useCallback(async () => {
    const sound = soundRef.current
    if (!sound) return
    await sound.stopAsync()
    setPlaybackPositionMs(0)
    setIsPlayingVoice(false)
  }, [])

  const playOrPauseVoice = useCallback(async (targetAttachment?: NoteAttachment) => {
    try {
      const attachment =
        targetAttachment ??
        selectedVoiceAttachment ??
        (selectedAttachmentId
          ? attachments.find((item) => item.id === selectedAttachmentId) ?? null
          : null) ??
        (primaryAttachmentId
          ? attachments.find((item) => item.id === primaryAttachmentId) ?? null
          : null) ??
        attachments[0] ??
        null
      debugVoiceFlow("play:start", {
        requestedAttId: targetAttachment?.id ?? null,
        selectedAttachmentId,
        primaryAttachmentId,
        resolvedAttId: attachment?.id ?? null,
        resolvedBlobId: attachment?.blobId ?? null,
      })
      if (!attachment) throw new Error("No voice recording available")

      if (targetAttachment && activeAttachmentId !== targetAttachment.id) {
        setActiveAttachmentId(targetAttachment.id)
      }

      const prepared = await resolveAttachment(attachment)
      if (!prepared || !prepared.localUri) throw new Error("Voice recording unavailable")

      let sound = soundRef.current
      if (sound && soundAttachmentIdRef.current && soundAttachmentIdRef.current !== attachment.id) {
        await unloadVoiceSound()
        sound = null
      }

      if (!sound) {
        const created = await Audio.Sound.createAsync(
          { uri: prepared.localUri },
          { shouldPlay: true },
          (status: AVPlaybackStatus) => {
            if (!status.isLoaded) return
            setPlaybackPositionMs(status.positionMillis)
            setIsPlayingVoice(status.isPlaying)
          },
        )
        soundRef.current = created.sound
        soundAttachmentIdRef.current = attachment.id
        setIsPlayingVoice(true)
        return
      }

      const status = await sound.getStatusAsync()
      if (!status.isLoaded) return
      if (status.isPlaying) {
        await sound.pauseAsync()
        setIsPlayingVoice(false)
      } else {
        await sound.playAsync()
        setIsPlayingVoice(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to play voice item")
    }
  }, [
    activeAttachmentId,
    attachments,
    primaryAttachmentId,
    resolveAttachment,
    selectedAttachmentId,
    selectedVoiceAttachment,
    unloadVoiceSound,
  ])

  const removeAttachment = useCallback(
    async (attachment: NoteAttachment) => {
      if (!canEdit) {
        setError("This item is read-only right now")
        return
      }

      const vmk = vaultSession.getKey()
      if (!vmk) return

      const nextAttachments = attachments.filter((item) => item.id !== attachment.id)
      const nextPrimaryAttachmentId = resolveExistingAttachmentId(
        nextAttachments,
        primaryAttachmentId === attachment.id ? null : primaryAttachmentId,
      )
      const nextActiveAttachmentId = resolveExistingAttachmentId(
        nextAttachments,
        activeAttachmentId === attachment.id ? null : activeAttachmentId,
        nextPrimaryAttachmentId,
      )
      const nextSelectedAttachment =
        nextAttachments.find((item) => item.id === nextActiveAttachmentId) ??
        nextAttachments.find((item) => item.id === nextPrimaryAttachmentId) ??
        nextAttachments[0] ??
        null
      const nextPrimaryAttachment =
        nextAttachments.find((item) => item.id === nextPrimaryAttachmentId) ?? nextAttachments[0] ?? null

      await deleteEncryptedAttachment(attachmentScope, attachment.id)
      setAttachmentStates((prev) => {
        const copy = { ...prev }
        delete copy[attachment.id]
        return copy
      })

      if (soundAttachmentIdRef.current === attachment.id) {
        await unloadVoiceSound()
      }

      if (viewer.visible && selectedAttachment?.id === attachment.id) {
        setViewer((prev) => ({ ...prev, visible: false }))
      }

      setAttachments(nextAttachments)
      setPrimaryAttachmentId(nextPrimaryAttachmentId)
      setActiveAttachmentId(nextActiveAttachmentId)
      if (isVoiceItem) {
        setVoiceDurationMs(nextSelectedAttachment?.durationMs ?? null)
      }

      if (!noteId) return

      const saved = saveNote(
        {
          id: noteId,
          title: titleTrimmed,
          body,
          classification,
          itemType,
          deletedAt,
          vaultId,
          attachments: nextAttachments,
          primaryAttachmentId: nextPrimaryAttachmentId,
          voiceDurationMs: nextPrimaryAttachment?.durationMs ?? null,
        },
        vmk,
        { suppressSync: true },
      )

      hydrateFromNote(saved)
      if (saved.vaultId) {
        await syncSavedNoteOnly(saved)
      }
    },
    [
      activeAttachmentId,
      attachmentScope,
      attachments,
      body,
      canEdit,
      classification,
      deletedAt,
      hydrateFromNote,
      isVoiceItem,
      itemType,
      noteId,
      primaryAttachmentId,
      selectedAttachment?.id,
      unloadVoiceSound,
      syncSavedNoteOnly,
      titleTrimmed,
      vaultId,
      viewer.visible,
    ],
  )

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      if (noteId) loadNote()
      else {
        setIsExisting(false)
        setTitle("")
        setBody("")
        setVaultId(getRemoteVaultId())
        setClassification(DEFAULT_VAULT_CLASSIFICATION)
        setDeletedAt(null)
        setAttachments([])
        setAttachmentStates({})
        setError(null)
        setItemType(requestedType)
        setPrimaryAttachmentId(null)
        setVoiceDurationMs(null)
        setActiveAttachmentId(route.params?.attachmentId ?? null)
      }
    }, [loadNote, navigation, noteId, requestedType, route.params?.attachmentId]),
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
    if (isVoiceItem) {
      if (shouldPrepareVoiceAttachment(selectedVoiceAttachment, selectedVoiceState)) {
        void resolveAttachment(selectedVoiceAttachment!, { silent: true })
      }
      return
    }
    if (selectedAttachment) {
      void resolveAttachment(selectedAttachment, { silent: true })
    }
  }, [isVoiceItem, resolveAttachment, selectedAttachment, selectedVoiceAttachment, selectedVoiceState])

  useEffect(() => {
    if (activeAttachmentId !== selectedAttachmentId) {
      setActiveAttachmentId(selectedAttachmentId)
    }
  }, [activeAttachmentId, selectedAttachmentId])

  useEffect(() => {
    if (soundAttachmentIdRef.current && soundAttachmentIdRef.current !== selectedAttachment?.id) {
      void unloadVoiceSound()
    }
  }, [selectedAttachment?.id, unloadVoiceSound])

  useEffect(() => {
    if (!importType || !vaultSession.isUnlocked() || deletedAt) return
    if (importType === "voice") return
    const timer = setTimeout(() => {
      void handleImportAttachment(importType)
      navigation.setParams({ importType: undefined })
    }, 80)
    return () => clearTimeout(timer)
  }, [deletedAt, handleImportAttachment, importType, navigation])

  useEffect(() => {
    return () => {
      const recording = recordingRef.current
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => undefined)
      }
      const sound = soundRef.current
      if (sound) {
        sound.unloadAsync().catch(() => undefined)
      }
    }
  }, [])

  const attachmentSectionSubtitle = useMemo(() => {
    if (attachments.length === 0) {
      return isFileFirstItem
        ? `No ${getFamilyLabel(effectiveItemType)} attachments yet`
        : "No attachments yet"
    }
    return `${attachments.length} secure ${getFamilyLabel(effectiveItemType)} attachment${attachments.length === 1 ? "" : "s"}`
  }, [attachments.length, effectiveItemType, isFileFirstItem])

  const attachmentActionLabel = useMemo(() => {
    if (effectiveItemType === "image") return "Add Image"
    if (effectiveItemType === "pdf") return "Add PDF"
    return "Add Document"
  }, [effectiveItemType])

  const heroSubtitle = useMemo(() => {
    if (deletedAt) return "Item is currently in trash"
    if (isVoiceItem) {
      return selectedVoiceDurationMs
        ? `${formatDuration(selectedVoiceDurationMs)} recorded`
        : "Record and secure audio in-app"
    }
    if (isFileFirstItem) return selectedAttachment?.filename ?? "Secure file preview"
    return noteId ? "Edit encrypted content" : "Create a protected note"
  }, [deletedAt, isFileFirstItem, isVoiceItem, noteId, selectedAttachment?.filename, selectedVoiceDurationMs])

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$insets, $screen])}>
      <VaultHubBackground reducedMotion dimmed />

      <ScrollView contentContainerStyle={themed($content)} showsVerticalScrollIndicator={false}>
        <HeroCard
          themed={themed}
          title={getVaultItemLabel(effectiveItemType)}
          subtitle={heroSubtitle}
          itemType={effectiveItemType}
          scopeLabel={vaultId ? "Account vault" : "Local vault"}
          canExport={!isExporting}
          onExport={() => void exportCurrentItem()}
          icon={
            isVoiceItem ? (
              <Mic size={18} color="#fff" />
            ) : isFileFirstItem ? (
              effectiveItemType === "image" ? (
                <LucideImage size={18} color="#fff" />
              ) : (
                <FileText size={18} color="#fff" />
              )
            ) : (
              <NotebookPen size={18} color="#fff" />
            )
          }
        />

        {error ? (
          <View style={themed($errorBanner)}>
            <Ionicons name="alert-circle-outline" size={14} color="#FFB6C7" />
            <Text style={themed($errorBannerText)}>{error}</Text>
          </View>
        ) : null}

        {!isFileFirstItem && !isVoiceItem ? (
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
        ) : null}

        {isVoiceItem ? (
          <>
            <GlassSection
              themed={themed}
              title="Voice Name"
              subtitle="Optional title used as the secure item name"
              icon={<NotebookPen size={14} color="#FFC8F3" />}
            >
              <IconTextInput
                themed={themed}
                theme={theme}
                placeholder="Voice item title"
                value={title}
                onChangeText={setTitle}
                icon={<NotebookPen size={15} color="rgba(255,255,255,0.75)" />}
                multiline={false}
                inputStyle={themed($titleInput)}
              />
            </GlassSection>

            <VoiceStudioCard
              themed={themed}
              title={titleTrimmed || "Voice Studio"}
              pulseStyle={pulseStyle}
              isRecording={isRecording}
              isRecordingPaused={isRecordingPaused}
              isProcessing={isSavingVoice}
              processingLabel="Saving recording..."
              isPlaying={isPlayingVoice}
              durationLabel={formatDuration(recordingDurationMs || selectedVoiceDurationMs || 0)}
              playbackLabel={formatDuration(playbackPositionMs)}
              canRecord={canEdit}
              hasVoice={attachments.length > 0}
              onStartRecord={() => void startRecording()}
              onPauseRecord={() => void pauseOrResumeRecording()}
              onStopRecord={() => void stopRecording()}
              onPlayPause={() => void playOrPauseVoice()}
              onStopPlayback={() => void stopVoicePlayback()}
              onExport={() => void exportCurrentItem()}
            />

            {attachments.length === 0 ? (
              <EmptyAttachmentState themed={themed} label="Record a secure clip to store it inside this voice item." />
            ) : (
              <GlassSection
                themed={themed}
                title="Recordings"
                subtitle={attachmentSectionSubtitle}
                icon={<Mic size={14} color="#FFC8F3" />}
                rightSlot={<Text style={themed($tinyMetaText)}>{canEdit ? "Select a clip" : "Read-only"}</Text>}
              >
                {isSavingVoice ? (
                  <Text style={themed($tinyMetaText)}>Saving recording...</Text>
                ) : null}
                <View style={themed($attachmentList)}>
                  {attachments.map((attachment) => (
                    <AttachmentRow
                      key={attachment.id}
                      themed={themed}
                      att={attachment}
                      state={attachmentStates[attachment.id] ?? { status: "idle" }}
                      selected={attachment.id === selectedVoiceAttachment?.id}
                      onSelect={() => setActiveAttachmentId(attachment.id)}
                      onOpen={() => void playOrPauseVoice(attachment)}
                      onDownload={() => void resolveAttachment(attachment)}
                      onRemove={() => void removeAttachment(attachment)}
                      canEdit={canEdit}
                    />
                  ))}
                </View>
              </GlassSection>
            )}
          </>
        ) : null}

        {isFileFirstItem ? (
          <GlassSection
            themed={themed}
            title="Attachments"
            subtitle={attachmentSectionSubtitle}
            icon={<Paperclip size={14} color="#FFC8F3" />}
            rightSlot={<Text style={themed($tinyMetaText)}>{canEdit ? "Secure file surface" : "Read-only"}</Text>}
          >
            <View style={themed($fileTitleBar)}>
              <IconTextInput
                themed={themed}
                theme={theme}
                placeholder="Item title"
                value={title}
                onChangeText={setTitle}
                icon={<NotebookPen size={15} color="rgba(255,255,255,0.75)" />}
                multiline={false}
                inputStyle={themed($titleInput)}
                containerStyle={themed($compactInput)}
              />
              <Text style={themed($tinyMetaText)}>
                Only {getFamilyLabel(effectiveItemType)} files are allowed in this secure item.
              </Text>
            </View>

            {attachments.length === 0 ? (
              <EmptyAttachmentState themed={themed} label="Import an image, PDF, or document to secure it inside the vault." />
            ) : effectiveItemType === "image" ? (
              <View style={themed($imageGrid)}>
                {attachments.map((attachment) => (
                  <ImageAttachmentCard
                    key={attachment.id}
                    themed={themed}
                    att={attachment}
                    state={attachmentStates[attachment.id] ?? { status: "idle" }}
                    selected={attachment.id === selectedAttachment?.id}
                    onOpen={() => void openAttachmentViewer(attachment)}
                    onPrepare={() => void resolveAttachment(attachment)}
                    onSelect={() => setActiveAttachmentId(attachment.id)}
                    onRemove={() => void removeAttachment(attachment)}
                    canEdit={canEdit}
                  />
                ))}
              </View>
            ) : (
              <View style={themed($attachmentList)}>
                {attachments.map((attachment) => (
                  <AttachmentRow
                    key={attachment.id}
                    themed={themed}
                    att={attachment}
                    state={attachmentStates[attachment.id] ?? { status: "idle" }}
                    selected={attachment.id === selectedAttachment?.id}
                    onSelect={() => setActiveAttachmentId(attachment.id)}
                    onOpen={() => void openAttachmentViewer(attachment)}
                    onDownload={() => void resolveAttachment(attachment)}
                    onRemove={() => void removeAttachment(attachment)}
                    canEdit={canEdit}
                  />
                ))}
              </View>
            )}

            <View style={themed($quickActionGrid)}>
              <MiniIconButton
                themed={themed}
                label={attachmentActionLabel}
                icon={
                  effectiveItemType === "image" ? (
                    <LucideImage size={14} color="#FFE8FD" />
                  ) : effectiveItemType === "pdf" ? (
                    <FileText size={14} color="#FFE8FD" />
                  ) : (
                    <Upload size={14} color="#FFE8FD" />
                  )
                }
                onPress={() =>
                  void handleImportAttachment(
                    effectiveItemType === "image"
                      ? "image"
                      : effectiveItemType === "pdf"
                        ? "pdf"
                        : "file",
                  )
                }
                disabled={!canEdit}
              />
            </View>
          </GlassSection>
        ) : null}

        <GlassSection
          themed={themed}
          title={isFileFirstItem || isVoiceItem ? "Security Profile" : "Classification"}
          subtitle={
            isFileFirstItem || isVoiceItem
              ? "Classification and encrypted item metadata"
              : "Choose protection label"
          }
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

          {(isFileFirstItem || isVoiceItem) && selectedAttachment ? (
            <View style={themed($metaGrid)}>
              <MetaChip themed={themed} label={`Type ${effectiveItemType.toUpperCase()}`} />
              <MetaChip themed={themed} label={formatBytes(selectedAttachment.sizeBytes)} />
              <MetaChip themed={themed} label={selectedAttachment.mime} />
              {isVoiceItem && selectedVoiceDurationMs ? (
                <MetaChip themed={themed} label={formatDuration(selectedVoiceDurationMs)} />
              ) : null}
            </View>
          ) : null}
        </GlassSection>

        <GradientPrimaryButton
          label={saveLabel}
          icon={<Save size={15} color="#1D0820" />}
          onPress={handleSave}
          themed={themed}
          disabled={!canSaveItem}
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
                label="Restore Item"
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
      </ScrollView>

      <SecureItemViewerModal
        visible={viewer.visible}
        title={viewer.title}
        subtitle={viewer.subtitle}
        itemType={viewer.itemType}
        sourceUri={viewer.sourceUri}
        dataUri={viewer.dataUri}
        html={viewer.html}
        imageItems={viewer.imageItems}
        initialImageIndex={viewer.initialImageIndex}
        fallbackMessage={viewer.fallbackMessage}
        onClose={() => setViewer((prev) => ({ ...prev, visible: false }))}
        onExport={() => void exportCurrentItem()}
      />
    </Screen>
  )
}

function buildTextViewerHtml(text: string, title: string): string {
  const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{background:#06070c;color:#f7f7fb;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px}h1{font-size:18px;margin-bottom:16px}pre{white-space:pre-wrap;line-height:1.6;color:#cfd1dc}</style></head><body><h1>${safeTitle}</h1><pre>${safeText}</pre></body></html>`
}

function isTextMime(mime: string): boolean {
  return mime.startsWith("text/") || mime.includes("json") || mime.includes("xml")
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${bytes} B`
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function stripExtension(filename?: string | null): string {
  if (!filename) return ""
  const index = filename.lastIndexOf(".")
  return index > 0 ? filename.slice(0, index) : filename
}

function inferItemTypeFromNote(note: Note): VaultItemType {
  if (note.itemType && note.itemType !== "note") return note.itemType
  if ((note.attachments?.length ?? 0) > 0 && !(note.body ?? "").trim()) {
    return getVaultItemTypeFromMime(note.attachments?.[0]?.mime ?? "application/octet-stream")
  }
  return note.itemType ?? "note"
}

function getFamilyLabel(itemType: VaultItemType): string {
  if (itemType === "image") return "image"
  if (itemType === "pdf") return "PDF"
  if (itemType === "voice") return "voice"
  return "document"
}

function generateVaultNoteId(): string {
  const bytes = randomBytes(12)
  const base64 = bytesToBase64(bytes)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

const VOICE_BARS = [18, 28, 36, 22, 42, 30, 18, 34, 24, 16]

const $screen: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  backgroundColor: "#07060A",
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingBottom: spacing.xl,
  gap: spacing.sm,
})

const $heroCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.sm,
  padding: spacing.sm,
  borderRadius: 20,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.09)",
  overflow: "hidden",
})

const $heroTopRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 10,
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

const $heroControls: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $rolePill: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  paddingHorizontal: 8,
  paddingVertical: 5,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $rolePillText: ThemedStyle<TextStyle> = () => ({
  color: "#F9E7FF",
  fontSize: 10,
  textTransform: "capitalize",
})

const $downloadPill: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: "#E8FF8A",
})

const $downloadPillText: ThemedStyle<TextStyle> = () => ({
  color: "#0d0a14",
  fontSize: 10,
  fontWeight: "700",
})

const $heroTitleRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})

const $heroIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 44,
  height: 44,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(226, 89, 255, 0.22)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.14)",
})

const $heroTextWrap: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $heroTitle: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontSize: 18,
  fontWeight: "700",
})

const $heroSubtitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(230,230,236,0.72)",
  fontSize: 12,
  lineHeight: 16,
  marginTop: 3,
})

const $errorBanner: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 8,
  paddingHorizontal: 12,
  paddingVertical: 10,
  borderRadius: 14,
  backgroundColor: "rgba(255, 120, 149, 0.1)",
  borderWidth: 1,
  borderColor: "rgba(255, 120, 149, 0.18)",
})

const $errorBannerText: ThemedStyle<TextStyle> = () => ({
  color: "#FFD4DE",
  flex: 1,
  fontSize: 12,
})

const $sectionCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.sm,
  borderRadius: 18,
  backgroundColor: "rgba(255,255,255,0.055)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  gap: spacing.sm,
})

const $sectionHeader: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
})

const $sectionHeaderLeft: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
  flex: 1,
})

const $sectionIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 30,
  height: 30,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
})

const $sectionHeaderText: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $sectionTitle: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontSize: 14,
  fontWeight: "700",
})

const $sectionSubtitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(228,227,234,0.68)",
  fontSize: 11,
  marginTop: 2,
})

const $glassInput: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 14,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.07)",
  flexDirection: "row",
  alignItems: "flex-start",
  gap: 8,
  paddingHorizontal: 10,
  paddingVertical: 10,
})

const $glassInputIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 18,
  paddingTop: 1,
  alignItems: "center",
})

const $glassInputField: ThemedStyle<TextStyle> = () => ({
  flex: 1,
  color: "#fff",
  fontSize: 14,
  minHeight: 20,
})

const $titleInput: ThemedStyle<TextStyle> = () => ({
  fontSize: 15,
  fontWeight: "600",
})

const $bodyInputWrap: ThemedStyle<ViewStyle> = () => ({
  minHeight: 120,
})

const $bodyInput: ThemedStyle<TextStyle> = () => ({
  minHeight: 100,
  lineHeight: 18,
  fontSize: 14,
})

const $inputGap: ThemedStyle<ViewStyle> = () => ({
  height: 2,
})

const $chipRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $chipPressable: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 999,
})

const $chipSelected: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.sm,
  paddingVertical: 7,
})

const $chipTextSelected: ThemedStyle<TextStyle> = () => ({
  color: "#120913",
  fontWeight: "700",
  fontSize: 12,
})

const $chip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: 7,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $chipText: ThemedStyle<TextStyle> = () => ({
  color: "#EEE8F4",
  fontWeight: "600",
  fontSize: 12,
})

const $metaGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $metaChip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 999,
  paddingHorizontal: spacing.sm,
  paddingVertical: 6,
  backgroundColor: "rgba(17, 17, 17, 0.75)",
  // borderWidth: 1,
  // borderColor: "rgba(255,255,255,0.08)",
})

const $metaChipText: ThemedStyle<TextStyle> = () => ({
  color: "#D9D7E2",
  fontSize: 11,
})

const $previewCard: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 20,
  overflow: "hidden",
  backgroundColor: "rgba(255,255,255,0.055)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $previewImage: ThemedStyle<ImageStyle> = () => ({
  width: "100%",
  height: 180,
})

const $previewFallback: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 170,
  padding: spacing.md,
  justifyContent: "center",
  gap: spacing.sm,
})

const $previewIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 42,
  height: 42,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.1)",
})

const $previewCopy: ThemedStyle<ViewStyle> = () => ({
  gap: 4,
})

const $previewTitle: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontSize: 15,
  fontWeight: "700",
})

const $previewMeta: ThemedStyle<TextStyle> = () => ({
  color: "rgba(228,227,234,0.72)",
  fontSize: 12,
  lineHeight: 16,
})

const $previewFooter: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.sm,
  backgroundColor: "rgba(0,0,0,0.16)",
})

const $previewFooterText: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontWeight: "600",
  fontSize: 12,
})

const $tinyMetaText: ThemedStyle<TextStyle> = () => ({
  color: "rgba(228,227,234,0.64)",
  fontSize: 11,
})

const $fileTitleBar: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $compactInput: ThemedStyle<ViewStyle> = () => ({
  minHeight: 0,
})

const $emptyAttachmentState: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: spacing.lg,
  paddingHorizontal: spacing.sm,
  gap: spacing.xs,
})

const $emptyAttachmentIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 38,
  height: 38,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
})

const $emptyAttachmentTitle: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontWeight: "700",
  fontSize: 13,
})

const $emptyAttachmentSubtitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(228,227,234,0.68)",
  textAlign: "center",
  lineHeight: 17,
  fontSize: 11,
})

const $attachmentList: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $imageGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $imageTile: ThemedStyle<ViewStyle> = () => ({
  width: "48%",
  minHeight: 170,
  borderRadius: 16,
  overflow: "hidden",
  backgroundColor: "rgba(255,255,255,0.045)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $imageTileSelected: ThemedStyle<ViewStyle> = () => ({
  borderColor: "rgba(255, 154, 219, 0.36)",
})

const $imageTilePreview: ThemedStyle<ImageStyle> = () => ({
  width: "100%",
  height: 118,
})

const $imageTilePlaceholder: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
  height: 118,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
  gap: 6,
})

const $imageTileHint: ThemedStyle<TextStyle> = () => ({
  color: "rgba(228,227,234,0.72)",
  fontSize: 11,
})

const $imageTileFooter: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.xs,
  paddingVertical: spacing.xs,
  gap: 3,
})

const $imageTileTitle: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontWeight: "700",
  fontSize: 12,
})

const $imageTileMeta: ThemedStyle<TextStyle> = () => ({
  color: "rgba(228,227,234,0.66)",
  fontSize: 10,
})

const $imageTileRemove: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 8,
  right: 8,
  width: 26,
  height: 26,
  borderRadius: 13,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(10,10,16,0.72)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
})

const $attachmentCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 14,
  padding: spacing.xs,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.07)",
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $attachmentCardSelected: ThemedStyle<ViewStyle> = () => ({
  borderColor: "rgba(255, 154, 219, 0.36)",
  backgroundColor: "rgba(255, 154, 219, 0.08)",
})

const $attachmentImage: ThemedStyle<ImageStyle> = () => ({
  width: 48,
  height: 48,
  borderRadius: 12,
})

const $attachmentPlaceholder: ThemedStyle<ViewStyle> = () => ({
  width: 48,
  height: 48,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
})

const $attachmentBody: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $attachmentName: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontWeight: "600",
  fontSize: 13,
})

const $attachmentMeta: ThemedStyle<TextStyle> = () => ({
  color: "rgba(228,227,234,0.66)",
  fontSize: 11,
  marginTop: 2,
})

const $attachmentError: ThemedStyle<TextStyle> = () => ({
  color: "#FFB6C7",
  fontSize: 11,
  marginTop: 2,
})

const $attachmentButton: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 8,
  backgroundColor: "rgba(255,255,255,0.08)",
})

const $attachmentButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontSize: 11,
  fontWeight: "700",
})

const $attachmentRemoveButton: ThemedStyle<ViewStyle> = () => ({
  width: 34,
  height: 34,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255, 110, 148, 0.08)",
  borderWidth: 1,
  borderColor: "rgba(255, 110, 148, 0.18)",
})

const $quickActionGrid: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $miniActionButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 88,
  borderRadius: 14,
  paddingHorizontal: spacing.sm,
  paddingVertical: 8,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xs,
})

const $disabledButton: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.45,
})

const $miniActionIconWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
})

const $miniActionText: ThemedStyle<TextStyle> = () => ({
  color: "#F7E7FF",
  fontWeight: "600",
  fontSize: 11,
})

const $voiceCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 20,
  padding: spacing.md,
  backgroundColor: "rgba(255,255,255,0.055)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  gap: spacing.sm,
})

const $voiceHeader: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
})

const $voiceTitle: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontSize: 15,
  fontWeight: "700",
})

const $voiceSubtitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(228,227,234,0.68)",
  fontSize: 11,
  marginTop: 2,
})

const $voiceBadge: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: "#E8FF8A",
})

const $voiceBadgeText: ThemedStyle<TextStyle> = () => ({
  color: "#120913",
  fontWeight: "700",
  fontSize: 11,
})

const $voiceOrbShell: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 6,
})

const $voicePulseRing: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  width: 128,
  height: 128,
  borderRadius: 64,
  backgroundColor: "rgba(215, 109, 255, 0.12)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $voiceOrbCore: ThemedStyle<ViewStyle> = () => ({
  width: 88,
  height: 88,
  borderRadius: 44,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(211, 88, 255, 0.28)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.14)",
})

const $waveRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "flex-end",
  gap: spacing.xs,
})

const $waveBar: ThemedStyle<ViewStyle> = () => ({
  width: 6,
  borderRadius: 999,
  backgroundColor: "#FF9AE4",
})

const $voiceMetaRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $voiceControls: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $buttonBlock: ThemedStyle<ViewStyle> = () => ({
  marginTop: 2,
})

const $primaryButton: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 16,
  minHeight: 48,
  justifyContent: "center",
})

const $primaryButtonContent: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
})

const $primaryButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#170918",
  fontWeight: "800",
  fontSize: 14,
})

const $ghostButton: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 16,
  minHeight: 46,
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $ghostButtonContent: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
})

const $ghostButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#F7E7FF",
  fontWeight: "700",
  fontSize: 13,
})

const $dangerButton: ThemedStyle<ViewStyle> = () => ({
  borderRadius: 16,
  minHeight: 46,
  justifyContent: "center",
  backgroundColor: "rgba(255, 110, 148, 0.1)",
  borderWidth: 1,
  borderColor: "rgba(255, 110, 148, 0.18)",
})

const $dangerButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#FFB7C9",
  fontWeight: "700",
  fontSize: 13,
})

const $trashedActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

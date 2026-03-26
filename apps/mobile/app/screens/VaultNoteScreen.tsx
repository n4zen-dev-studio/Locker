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
import {
  buildAttachmentBlobBytes,
  buildAttachmentBlobId,
  generateAttachmentId,
  parseAttachmentBlobBytes,
} from "@/locker/attachments/attachmentCodec"
import {
  deleteEncryptedAttachment,
  hasEncryptedAttachment,
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
import { fetchJson, fetchRaw } from "@/locker/net/apiClient"
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
import { recordSecurityEvent } from "@/locker/security/auditLogRepo"

type VaultMemberRecord = {
  userId: string
  role?: "owner" | "admin" | "editor" | "viewer"
}

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
  fallbackMessage?: string
}

const LOCAL_ATTACHMENT_SCOPE = "__local__"
const MAX_ATTACHMENT_BYTES = 20_000_000
const AUTO_DOWNLOAD_MAX_BYTES = 1_500_000
const VOICE_MIME = "audio/m4a"

const fileSystemCompat = FileSystem as any

export const VaultNoteScreen: FC<VaultStackScreenProps<"VaultNote">> = function VaultNoteScreen(
  props,
) {
  const { navigation, route } = props
  const { themed, theme } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

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
  const [role, setRole] = useState<"owner" | "admin" | "editor" | "viewer" | "unknown">("unknown")
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
  const [isPlayingVoice, setIsPlayingVoice] = useState(false)
  const [playbackPositionMs, setPlaybackPositionMs] = useState(0)

  const recordingRef = useRef<Audio.Recording | null>(null)
  const soundRef = useRef<Audio.Sound | null>(null)
  const pulse = useSharedValue(1)

  const attachmentScope = vaultId ?? LOCAL_ATTACHMENT_SCOPE
  const canEdit = role !== "viewer"
  const selectedAttachmentId = activeAttachmentId ?? route.params?.attachmentId ?? primaryAttachmentId

  const selectedAttachment = useMemo(() => {
    if (selectedAttachmentId) {
      return attachments.find((attachment) => attachment.id === selectedAttachmentId) ?? null
    }
    return attachments[0] ?? null
  }, [attachments, selectedAttachmentId])

  const effectiveItemType = useMemo<VaultItemType>(() => {
    if (selectedAttachment) return getVaultItemTypeFromMime(selectedAttachment.mime)
    return itemType
  }, [itemType, selectedAttachment])

  const isFileFirstItem =
    effectiveItemType === "image" || effectiveItemType === "pdf" || effectiveItemType === "doc"
  const isVoiceItem = effectiveItemType === "voice"
  const saveLabel = noteId ? "Update Secure Item" : "Save Secure Item"

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
      setTitle(note.title)
      setBody(note.body)
      setVaultId(note.vaultId ?? null)
      setClassification(note.classification ?? DEFAULT_VAULT_CLASSIFICATION)
      setDeletedAt(note.deletedAt ?? null)
      setAttachments(note.attachments ?? [])
      setItemType(note.itemType ?? "note")
      setPrimaryAttachmentId(note.primaryAttachmentId ?? null)
      setVoiceDurationMs(note.voiceDurationMs ?? null)
      const routeAttachmentId = route.params?.attachmentId ?? null
      setActiveAttachmentId(routeAttachmentId ?? note.primaryAttachmentId ?? note.attachments?.[0]?.id ?? null)
    },
    [route.params?.attachmentId],
  )

  const syncSavedAttachmentNote = useCallback(
    async (saved: Note, blobBytes: Uint8Array, attachmentId: string, vaultKey: Uint8Array) => {
      const deviceId = getAccount()?.device.id
      if (!deviceId || !saved.vaultId) return
      enqueueUpdateIndexData(listNoteIds(saved.vaultId), saved.vaultId, vaultKey, deviceId)
      enqueueUpsertNoteData(saved, saved.vaultId, vaultKey, deviceId)
      enqueueUpsertAttachmentBlob({
        vaultId: saved.vaultId,
        bytes: blobBytes,
        noteId: saved.id,
        attId: attachmentId,
      })
      await requestSync("note_change", saved.vaultId)
    },
    [],
  )

  const upsertAttachment = useCallback((list: NoteAttachment[], next: NoteAttachment) => {
    const existingIndex = list.findIndex((attachment) => attachment.id === next.id)
    if (existingIndex === -1) return [next, ...list]
    const copy = [...list]
    copy[existingIndex] = next
    return copy
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

  const resolveAttachment = useCallback(
    async (att: NoteAttachment, options?: { silent?: boolean }) => {
      const existingState = attachmentStates[att.id]
      if (existingState?.status === "ready" && existingState.localUri) return existingState

      const key = vaultId ? await getRemoteVaultKey(vaultId) : vaultSession.getKey()
      if (!key) {
        if (!options?.silent) setError("Missing attachment key")
        return null
      }

      setAttachmentStates((prev) => ({ ...prev, [att.id]: { status: "downloading" } }))

      try {
        let encryptedBytes = await readEncryptedAttachment(attachmentScope, att.id)
        if (!encryptedBytes) {
          if (!vaultId) throw new Error("Attachment not cached on this device")
          const token = await getToken()
          if (!token) throw new Error("Link device first")
          encryptedBytes = await fetchRaw(`/v1/vaults/${vaultId}/blobs/${att.blobId}`, {}, { token })
          await writeEncryptedAttachment(attachmentScope, att.id, encryptedBytes)
        }

        if (att.sha256 && sha256Hex(encryptedBytes) !== att.sha256) {
          const nextState: AttachmentUiState = { status: "corrupt", error: "Integrity check failed" }
          setAttachmentStates((prev) => ({ ...prev, [att.id]: nextState }))
          return nextState
        }

        const payload = parseAttachmentBlobBytes(encryptedBytes, key)
        if (payload.attId !== att.id) throw new Error("Attachment mismatch")

        const filename = payload.filename ?? att.filename ?? `${effectiveItemType}-${att.id}`
        const localUri = await writeTempFile(filename, payload.fileBytes)
        const state: AttachmentUiState = {
          status: "ready",
          filename,
          localUri,
          mime: payload.mime,
          dataUri:
            payload.mime.startsWith("image/") || payload.mime.startsWith("audio/")
              ? `data:${payload.mime};base64,${bytesToBase64(payload.fileBytes)}`
              : undefined,
          previewText: isTextMime(payload.mime) ? bytesToUtf8(payload.fileBytes).slice(0, 4000) : undefined,
        }

        setAttachmentStates((prev) => ({ ...prev, [att.id]: state }))
        return state
      } catch (err) {
        const message = err instanceof Error ? err.message : "Attachment download failed"
        const nextState: AttachmentUiState = { status: "error", error: message }
        setAttachmentStates((prev) => ({ ...prev, [att.id]: nextState }))
        if (!options?.silent) setError(message)
        return null
      }
    },
    [attachmentScope, attachmentStates, effectiveItemType, vaultId, writeTempFile],
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

      if (!selectedAttachment) throw new Error("No attachment available to export")
      const prepared = await resolveAttachment(selectedAttachment)
      if (!prepared || !prepared.localUri) throw new Error("Export file unavailable")
      await Sharing.shareAsync(prepared.localUri, { mimeType: prepared.mime ?? selectedAttachment.mime })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed")
    } finally {
      setIsExporting(false)
    }
  }, [body, effectiveItemType, resolveAttachment, selectedAttachment, title, writeTempFile])

  const openSelectedViewer = useCallback(async () => {
    if (!selectedAttachment) return
    const prepared = await resolveAttachment(selectedAttachment)
    if (!prepared || !prepared.localUri) return

    const subtitle = [selectedAttachment.filename ?? "Secure file", formatBytes(selectedAttachment.sizeBytes)]
      .filter(Boolean)
      .join(" · ")

    setViewer({
      visible: true,
      title: selectedAttachment.filename ?? getVaultItemLabel(effectiveItemType),
      subtitle,
      itemType: effectiveItemType,
      sourceUri: prepared.localUri,
      dataUri: prepared.dataUri,
      html:
        effectiveItemType === "doc" && prepared.previewText
          ? buildTextViewerHtml(prepared.previewText, selectedAttachment.filename ?? "Secure document")
          : undefined,
      fallbackMessage:
        effectiveItemType === "doc"
          ? "This document format does not have a native in-app renderer in the current stack. Export it from the vault to open it elsewhere."
          : undefined,
    })
  }, [effectiveItemType, resolveAttachment, selectedAttachment])

  const handleSave = useCallback(() => {
    const key = vaultSession.getKey()
    if (!key) return
    saveNote(
      {
        id: noteId,
        title: title.trim(),
        body,
        classification,
        itemType,
        primaryAttachmentId,
        voiceDurationMs,
        deletedAt,
        vaultId,
        attachments,
      },
      key,
    )
    navigation.goBack()
  }, [attachments, body, classification, deletedAt, itemType, navigation, noteId, primaryAttachmentId, title, vaultId, voiceDurationMs])

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
      setRole((member?.role as VaultMemberRecord["role"]) || "unknown")
    } catch {
      setRole("unknown")
    }
  }, [vaultId])

  const handleImportAttachment = useCallback(
    async (kind: VaultImportType) => {
      if (!vaultSession.isUnlocked()) return
      if (!canEdit) {
        setError("Viewer role cannot modify this item")
        return
      }

      const vmk = vaultSession.getKey()
      if (!vmk) return

      const picked = await DocumentPicker.getDocumentAsync({
        multiple: false,
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

      const asset = picked.assets?.[0]
      if (!asset?.uri) return

      const fileBase64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: fileSystemCompat.EncodingType.Base64,
      })
      const fileBytes = base64ToBytes(fileBase64)

      if (fileBytes.length > MAX_ATTACHMENT_BYTES) {
        setError(`Attachment exceeds ${formatBytes(MAX_ATTACHMENT_BYTES)} limit`)
        return
      }

      let activeNoteId = noteId
      if (!activeNoteId) {
        const saved = saveNote(
          {
            title: title.trim() || stripExtension(asset.name) || getVaultItemLabel(getVaultItemTypeFromMime(asset.mimeType ?? "application/octet-stream")),
            body,
            classification,
            itemType: getVaultItemTypeFromMime(asset.mimeType ?? "application/octet-stream"),
            deletedAt,
            vaultId,
            attachments: [],
            primaryAttachmentId: null,
            voiceDurationMs: null,
          },
          vmk,
        )
        activeNoteId = saved.id
        setIsExisting(true)
        hydrateFromNote(saved)
        navigation.replace("VaultNote", { noteId: saved.id })
      }

      const nextType = getVaultItemTypeFromMime(asset.mimeType ?? "application/octet-stream")
      const attachmentKey = vaultId ? await getRemoteVaultKey(vaultId) : vmk
      if (!attachmentKey) {
        setError("Missing attachment key for this item")
        return
      }

      const attId = primaryAttachmentId && itemType === nextType ? primaryAttachmentId : generateAttachmentId()
      const mime = asset.mimeType ?? "application/octet-stream"
      const blobBytes = buildAttachmentBlobBytes({
        rvk: attachmentKey,
        noteId: activeNoteId,
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
        blobId: buildAttachmentBlobId(activeNoteId, attId),
        createdAt: new Date().toISOString(),
      }

      await writeEncryptedAttachment(attachmentScope, attId, blobBytes)

      const nextAttachments = upsertAttachment(attachments, record)
      const saved = saveNote(
        {
          id: activeNoteId,
          title: title.trim() || stripExtension(asset.name) || getVaultItemLabel(nextType),
          body: nextType === "note" ? body : "",
          classification,
          itemType: nextType,
          deletedAt,
          vaultId,
          attachments: nextAttachments,
          primaryAttachmentId: attId,
          voiceDurationMs: nextType === "voice" ? null : voiceDurationMs,
        },
        vmk,
        { suppressSync: true },
      )

      hydrateFromNote(saved)
      setAttachmentStates((prev) => ({
        ...prev,
        [attId]: {
          status: "ready",
          localUri: asset.uri,
          mime,
          filename: asset.name ?? undefined,
          dataUri: mime.startsWith("image/") ? `data:${mime};base64,${fileBase64}` : undefined,
        },
      }))

      if (saved.vaultId) {
        await syncSavedAttachmentNote(saved, blobBytes, attId, attachmentKey)
      }
    },
    [
      attachmentScope,
      attachments,
      body,
      canEdit,
      classification,
      deletedAt,
      hydrateFromNote,
      itemType,
      navigation,
      noteId,
      primaryAttachmentId,
      syncSavedAttachmentNote,
      title,
      upsertAttachment,
      vaultId,
      voiceDurationMs,
    ],
  )

  const persistVoiceRecording = useCallback(
    async (uri: string, durationMs: number) => {
      const vmk = vaultSession.getKey()
      if (!vmk) return

      const fileBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: fileSystemCompat.EncodingType.Base64,
      })
      const fileBytes = base64ToBytes(fileBase64)
      if (fileBytes.length > MAX_ATTACHMENT_BYTES) {
        setError(`Recording exceeds ${formatBytes(MAX_ATTACHMENT_BYTES)} limit`)
        return
      }

      let activeNoteId = noteId
      if (!activeNoteId) {
        const draft = saveNote(
          {
            title: title.trim() || "Voice recording",
            body: "",
            classification,
            itemType: "voice",
            deletedAt,
            vaultId,
            attachments: [],
            primaryAttachmentId: null,
            voiceDurationMs: durationMs,
          },
          vmk,
        )
        activeNoteId = draft.id
        setIsExisting(true)
        hydrateFromNote(draft)
        navigation.replace("VaultNote", { noteId: draft.id, createType: "voice" })
      }

      const attachmentKey = vaultId ? await getRemoteVaultKey(vaultId) : vmk
      if (!attachmentKey) {
        setError("Missing attachment key for voice item")
        return
      }

      const attId = primaryAttachmentId ?? generateAttachmentId()
      const filename = `${(title.trim() || "voice-recording").replace(/[\\/]/g, "_")}.m4a`
      const blobBytes = buildAttachmentBlobBytes({
        rvk: attachmentKey,
        noteId: activeNoteId,
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
        blobId: buildAttachmentBlobId(activeNoteId, attId),
        createdAt: new Date().toISOString(),
        durationMs,
      }

      await writeEncryptedAttachment(attachmentScope, attId, blobBytes)

      const saved = saveNote(
        {
          id: activeNoteId,
          title: title.trim() || "Voice recording",
          body: "",
          classification,
          itemType: "voice",
          primaryAttachmentId: attId,
          voiceDurationMs: durationMs,
          deletedAt,
          vaultId,
          attachments: upsertAttachment(attachments, record),
        },
        vmk,
        { suppressSync: true },
      )

      hydrateFromNote(saved)
      setAttachmentStates((prev) => ({
        ...prev,
        [attId]: {
          status: "ready",
          localUri: uri,
          mime: VOICE_MIME,
          filename,
          dataUri: `data:${VOICE_MIME};base64,${fileBase64}`,
        },
      }))

      if (saved.vaultId) {
        await syncSavedAttachmentNote(saved, blobBytes, attId, attachmentKey)
      }
    },
    [
      attachmentScope,
      attachments,
      classification,
      deletedAt,
      hydrateFromNote,
      navigation,
      noteId,
      primaryAttachmentId,
      syncSavedAttachmentNote,
      title,
      upsertAttachment,
      vaultId,
    ],
  )

  const startRecording = useCallback(async () => {
    try {
      if (!canEdit) throw new Error("Viewer role cannot record audio")
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
      }
      setRecordingDurationMs(0)
    } catch (err) {
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

  const playOrPauseVoice = useCallback(async () => {
    try {
      if (!selectedAttachment) throw new Error("No voice recording available")
      const prepared = await resolveAttachment(selectedAttachment)
      if (!prepared || !prepared.localUri) throw new Error("Voice recording unavailable")

      let sound = soundRef.current
      if (!sound) {
        const created = await Audio.Sound.createAsync(
          { uri: prepared.localUri },
          { shouldPlay: true },
          (status: AVPlaybackStatus) => {
            if (!status.isLoaded) return
            setPlaybackPositionMs(status.positionMillis)
            setVoiceDurationMs(status.durationMillis ?? voiceDurationMs ?? selectedAttachment.durationMs ?? null)
            setIsPlayingVoice(status.isPlaying)
          },
        )
        soundRef.current = created.sound
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
  }, [resolveAttachment, selectedAttachment, voiceDurationMs])

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
      }
    }, [loadNote, navigation, noteId, requestedType]),
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

  useFocusEffect(
    useCallback(() => {
      void loadRole()
    }, [loadRole]),
  )

  useEffect(() => {
    if (selectedAttachment) {
      void resolveAttachment(selectedAttachment, { silent: true })
    }
  }, [resolveAttachment, selectedAttachment])

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

  const selectedAttachmentState = selectedAttachment
    ? attachmentStates[selectedAttachment.id] ?? { status: "idle" as const }
    : null

  const heroSubtitle = useMemo(() => {
    if (deletedAt) return "Item is currently in trash"
    if (isVoiceItem) return voiceDurationMs ? `${formatDuration(voiceDurationMs)} recorded` : "Record and secure audio in-app"
    if (isFileFirstItem) return selectedAttachment?.filename ?? "Secure file preview"
    return noteId ? "Edit encrypted content" : "Create a protected note"
  }, [deletedAt, isFileFirstItem, isVoiceItem, noteId, selectedAttachment?.filename, voiceDurationMs])

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$insets, $screen])}>
      <VaultHubBackground reducedMotion dimmed />

      <ScrollView contentContainerStyle={themed($content)} showsVerticalScrollIndicator={false}>
        <HeroCard
          themed={themed}
          title={getVaultItemLabel(effectiveItemType)}
          subtitle={heroSubtitle}
          itemType={effectiveItemType}
          role={role}
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

        <GlassSection
          themed={themed}
          title={isVoiceItem ? "Voice Details" : isFileFirstItem ? "Item Details" : "Content"}
          subtitle={isVoiceItem ? "Name and secure audio metadata" : isFileFirstItem ? "Title and protected file information" : "Title and note body"}
          icon={isVoiceItem ? <Mic size={14} color="#FFC8F3" /> : <NotebookPen size={14} color="#FFC8F3" />}
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

          {!isFileFirstItem && !isVoiceItem ? (
            <>
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
            </>
          ) : null}
        </GlassSection>

        {isFileFirstItem && selectedAttachment ? (
          <PreviewCard
            themed={themed}
            itemType={effectiveItemType}
            attachment={selectedAttachment}
            state={selectedAttachmentState}
            onOpen={() => void openSelectedViewer()}
            onLoad={() => void resolveAttachment(selectedAttachment)}
          />
        ) : null}

        {isVoiceItem ? (
          <VoiceStudioCard
            themed={themed}
            pulseStyle={pulseStyle}
            isRecording={isRecording}
            isRecordingPaused={isRecordingPaused}
            isPlaying={isPlayingVoice}
            durationLabel={formatDuration(recordingDurationMs || voiceDurationMs || 0)}
            playbackLabel={formatDuration(playbackPositionMs)}
            canRecord={canEdit}
            hasVoice={!!selectedAttachment}
            onStartRecord={() => void startRecording()}
            onPauseRecord={() => void pauseOrResumeRecording()}
            onStopRecord={() => void stopRecording()}
            onPlayPause={() => void playOrPauseVoice()}
            onStopPlayback={() => void stopVoicePlayback()}
            onExport={() => void exportCurrentItem()}
          />
        ) : null}

        {isFileFirstItem ? (
          <GlassSection
            themed={themed}
            title="Attachments"
            subtitle={attachments.length === 0 ? "No secure file attached yet" : `${attachments.length} secure attachment${attachments.length === 1 ? "" : "s"}`}
            icon={<Paperclip size={14} color="#FFC8F3" />}
            rightSlot={<Text style={themed($tinyMetaText)}>{canEdit ? "Tap a row to switch preview" : "Viewer mode"}</Text>}
          >
            {attachments.length === 0 ? (
              <EmptyAttachmentState themed={themed} label="Import an image, PDF, or document to secure it inside the vault." />
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
                    onOpen={() => void openSelectedViewer()}
                    onDownload={() => void resolveAttachment(attachment)}
                  />
                ))}
              </View>
            )}

            <View style={themed($quickActionGrid)}>
              <MiniIconButton
                themed={themed}
                label="Image"
                icon={<LucideImage size={14} color="#FFE8FD" />}
                onPress={() => void handleImportAttachment("image")}
                disabled={!canEdit}
              />
              <MiniIconButton
                themed={themed}
                label="PDF"
                icon={<FileText size={14} color="#FFE8FD" />}
                onPress={() => void handleImportAttachment("pdf")}
                disabled={!canEdit}
              />
              <MiniIconButton
                themed={themed}
                label="Document"
                icon={<Upload size={14} color="#FFE8FD" />}
                onPress={() => void handleImportAttachment("file")}
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
              {isVoiceItem && voiceDurationMs ? (
                <MetaChip themed={themed} label={formatDuration(voiceDurationMs)} />
              ) : null}
            </View>
          ) : null}
        </GlassSection>

        <GradientPrimaryButton
          label={saveLabel}
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
        fallbackMessage={viewer.fallbackMessage}
        onClose={() => setViewer((prev) => ({ ...prev, visible: false }))}
        onExport={() => void exportCurrentItem()}
      />
    </Screen>
  )
}

function HeroCard(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  title: string
  subtitle: string
  itemType: VaultItemType
  role: string
  canExport: boolean
  onExport: () => void
  icon: React.ReactNode
}) {
  const { themed, title, subtitle, itemType, role, canExport, onExport, icon } = props
  return (
    <View style={themed($heroCard)}>
      <View style={themed($heroTopRow)}>
        <View style={themed($heroBadge)}>
          <Shield size={13} color="#FFD8FA" />
          <Text style={themed($heroBadgeText)}>{itemType.toUpperCase()}</Text>
        </View>
        <View style={themed($heroControls)}>
          <View style={themed($rolePill)}>
            <LockKeyhole size={12} color="#FCE7FF" />
            <Text style={themed($rolePillText)}>{role}</Text>
          </View>
          <Pressable onPress={onExport} disabled={!canExport} style={themed($downloadPill)}>
            <Download size={14} color="#0d0a14" />
            <Text style={themed($downloadPillText)}>Export</Text>
          </Pressable>
        </View>
      </View>

      <View style={themed($heroTitleRow)}>
        <View style={themed($heroIconWrap)}>{icon}</View>
        <View style={themed($heroTextWrap)}>
          <Text style={themed($heroTitle)}>{title}</Text>
          <Text style={themed($heroSubtitle)}>{subtitle}</Text>
        </View>
      </View>
    </View>
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
          <View style={themed($sectionHeaderText)}>
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

function MetaChip(props: { themed: ReturnType<typeof useAppTheme>["themed"]; label: string }) {
  const { themed, label } = props
  return (
    <View style={themed($metaChip)}>
      <Text style={themed($metaChipText)} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

function PreviewCard(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  itemType: VaultItemType
  attachment: NoteAttachment
  state: AttachmentUiState | null
  onOpen: () => void
  onLoad: () => void
}) {
  const { themed, itemType, attachment, state, onOpen, onLoad } = props
  const isReady = state?.status === "ready"
  const canPreviewImage = itemType === "image" && !!state?.dataUri

  return (
    <Pressable onPress={isReady ? onOpen : onLoad} style={themed($previewCard)}>
      {canPreviewImage ? (
        <Image source={{ uri: state.dataUri }} style={themed($previewImage)} />
      ) : (
        <LinearGradient
          colors={["rgba(255,255,255,0.07)", "rgba(255,255,255,0.03)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={themed($previewFallback)}
        >
          <View style={themed($previewIconWrap)}>
            {itemType === "pdf" ? (
              <FileText size={20} color="#fff" />
            ) : itemType === "doc" ? (
              <Paperclip size={20} color="#fff" />
            ) : (
              <LucideImage size={20} color="#fff" />
            )}
          </View>
          <View style={themed($previewCopy)}>
            <Text style={themed($previewTitle)}>{attachment.filename ?? getVaultItemLabel(itemType)}</Text>
            <Text style={themed($previewMeta)}>
              {state?.status === "downloading"
                ? "Decrypting secure preview..."
                : itemType === "pdf"
                  ? "Tap to open secure PDF viewer"
                  : itemType === "doc"
                    ? "Tap to inspect secure document"
                    : "Tap to load secure preview"}
            </Text>
          </View>
        </LinearGradient>
      )}
      <View style={themed($previewFooter)}>
        <Text style={themed($previewFooterText)}>
          {isReady ? "Open secure viewer" : "Load secure preview"}
        </Text>
        <Ionicons name="expand-outline" size={18} color="#fff" />
      </View>
    </Pressable>
  )
}

function EmptyAttachmentState(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  label: string
}) {
  const { themed, label } = props
  return (
    <View style={themed($emptyAttachmentState)}>
      <View style={themed($emptyAttachmentIconWrap)}>
        <Paperclip size={18} color="#F7D3FF" />
      </View>
      <Text style={themed($emptyAttachmentTitle)}>No attachments yet</Text>
      <Text style={themed($emptyAttachmentSubtitle)}>{label}</Text>
    </View>
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
  const { themed, label, onPress } = props
  return (
    <Pressable onPress={onPress} style={themed($buttonBlock)}>
      <LinearGradient
        colors={["#FFA2EA", "#F06DFF", "#BF69FF"]}
        start={{ x: 0, y: 0.4 }}
        end={{ x: 1, y: 0.7 }}
        style={themed($primaryButton)}
      >
        <View style={themed($primaryButtonContent)}>
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
  selected?: boolean
  onSelect: () => void
  onOpen: () => void
  onDownload: () => void
}) {
  const { themed, att, state, selected, onSelect, onOpen, onDownload } = props
  const itemType = getVaultItemTypeFromMime(att.mime)

  return (
    <Pressable onPress={onSelect} style={themed([$attachmentCard, selected && $attachmentCardSelected])}>
      {state.dataUri ? (
        <Image source={{ uri: state.dataUri }} style={themed($attachmentImage)} />
      ) : (
        <View style={themed($attachmentPlaceholder)}>
          {itemType === "image" ? (
            <LucideImage size={18} color="#F5D8FF" />
          ) : itemType === "pdf" ? (
            <FileText size={18} color="#F5D8FF" />
          ) : itemType === "voice" ? (
            <Mic size={18} color="#F5D8FF" />
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
        {state.status === "corrupt" || state.status === "error" ? (
          <Text style={themed($attachmentError)}>{state.error ?? "Unreadable attachment"}</Text>
        ) : null}
      </View>

      <Pressable style={themed($attachmentButton)} onPress={state.status === "ready" ? onOpen : onDownload}>
        <Text style={themed($attachmentButtonText)}>
          {state.status === "downloading" ? "Loading..." : state.status === "ready" ? "Open" : "Get"}
        </Text>
      </Pressable>
    </Pressable>
  )
}

function VoiceStudioCard(props: {
  themed: ReturnType<typeof useAppTheme>["themed"]
  pulseStyle: ViewStyle
  isRecording: boolean
  isRecordingPaused: boolean
  isPlaying: boolean
  durationLabel: string
  playbackLabel: string
  canRecord: boolean
  hasVoice: boolean
  onStartRecord: () => void
  onPauseRecord: () => void
  onStopRecord: () => void
  onPlayPause: () => void
  onStopPlayback: () => void
  onExport: () => void
}) {
  const {
    themed,
    pulseStyle,
    isRecording,
    isRecordingPaused,
    isPlaying,
    durationLabel,
    playbackLabel,
    canRecord,
    hasVoice,
    onStartRecord,
    onPauseRecord,
    onStopRecord,
    onPlayPause,
    onStopPlayback,
    onExport,
  } = props

  return (
    <View style={themed($voiceCard)}>
      <View style={themed($voiceHeader)}>
        <View>
          <Text style={themed($voiceTitle)}>Voice Studio</Text>
          <Text style={themed($voiceSubtitle)}>
            {isRecording ? (isRecordingPaused ? "Recording paused" : "Recording live") : hasVoice ? "Encrypted playback ready" : "Create a secure voice item"}
          </Text>
        </View>
        <View style={themed($voiceBadge)}>
          <Mic size={14} color="#120913" />
          <Text style={themed($voiceBadgeText)}>{durationLabel}</Text>
        </View>
      </View>

      <View style={themed($voiceOrbShell)}>
        <Animated.View style={[themed($voicePulseRing), pulseStyle]} />
        <View style={themed($voiceOrbCore)}>
          <Mic size={28} color="#fff" />
        </View>
      </View>

      <View style={themed($waveRow)}>
        {VOICE_BARS.map((height, index) => (
          <View
            key={index}
            style={[
              themed($waveBar),
              {
                height,
                opacity: isRecording || isPlaying ? 1 : 0.45,
              },
            ]}
          />
        ))}
      </View>

      <View style={themed($voiceMetaRow)}>
        <MetaChip themed={themed} label={`Duration ${durationLabel}`} />
        <MetaChip themed={themed} label={`Playback ${playbackLabel}`} />
      </View>

      <View style={themed($voiceControls)}>
        {!isRecording ? (
          <MiniIconButton
            themed={themed}
            label="Record"
            icon={<Mic size={14} color="#FFE8FD" />}
            onPress={onStartRecord}
            disabled={!canRecord}
          />
        ) : (
          <>
            <MiniIconButton
              themed={themed}
              label={isRecordingPaused ? "Resume" : "Pause"}
              icon={<Ionicons name={isRecordingPaused ? "play" : "pause"} size={14} color="#FFE8FD" />}
              onPress={onPauseRecord}
            />
            <MiniIconButton
              themed={themed}
              label="Stop"
              icon={<Ionicons name="stop" size={14} color="#FFE8FD" />}
              onPress={onStopRecord}
            />
          </>
        )}

        <MiniIconButton
          themed={themed}
          label={isPlaying ? "Pause" : "Play"}
          icon={<Ionicons name={isPlaying ? "pause" : "play"} size={14} color="#FFE8FD" />}
          onPress={onPlayPause}
          disabled={!hasVoice}
        />
        <MiniIconButton
          themed={themed}
          label="Stop"
          icon={<Ionicons name="square" size={14} color="#FFE8FD" />}
          onPress={onStopPlayback}
          disabled={!hasVoice}
        />
        <MiniIconButton
          themed={themed}
          label="Export"
          icon={<Download size={14} color="#FFE8FD" />}
          onPress={onExport}
          disabled={!hasVoice}
        />
      </View>
    </View>
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
  backgroundColor: "rgba(255,255,255,0.045)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
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
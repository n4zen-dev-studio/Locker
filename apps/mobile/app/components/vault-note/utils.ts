import { bytesToBase64 } from "@/locker/crypto/encoding"
import { randomBytes } from "@/locker/crypto/random"
import type { Note } from "@/locker/storage/notesRepo"
import { getVaultItemTypeFromMime, type VaultItemType } from "@/locker/vault/types"

import type { AttachmentUiState } from "./types"

export const VOICE_BARS = [18, 28, 36, 22, 42, 30, 18, 34, 24, 16]

export function buildTextViewerHtml(text: string, title: string): string {
  const safeText = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const safeTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{background:#06070c;color:#f7f7fb;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px}h1{font-size:18px;margin-bottom:16px}pre{white-space:pre-wrap;line-height:1.6;color:#cfd1dc}</style></head><body><h1>${safeTitle}</h1><pre>${safeText}</pre></body></html>`
}

export function isTextMime(mime: string): boolean {
  return mime.startsWith("text/") || mime.includes("json") || mime.includes("xml")
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`
  return `${bytes} B`
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

export function stripExtension(filename?: string | null): string {
  if (!filename) return ""
  const index = filename.lastIndexOf(".")
  return index > 0 ? filename.slice(0, index) : filename
}

export function inferItemTypeFromNote(note: Note): VaultItemType {
  if (note.itemType && note.itemType !== "note") return note.itemType
  if ((note.attachments?.length ?? 0) > 0 && !(note.body ?? "").trim()) {
    return getVaultItemTypeFromMime(note.attachments?.[0]?.mime ?? "application/octet-stream")
  }
  return note.itemType ?? "note"
}

export function getFamilyLabel(itemType: VaultItemType): string {
  if (itemType === "image") return "image"
  if (itemType === "pdf") return "PDF"
  if (itemType === "voice") return "voice"
  return "document"
}

export function generateVaultNoteId(): string {
  const bytes = randomBytes(12)
  const base64 = bytesToBase64(bytes)
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

// export function getAttachmentPreviewImageUri(
//   mime: string,
//   state: Pick<AttachmentUiState, "dataUri" | "localUri" | "mime">,
// ): string | undefined {
//   const resolvedMime = state.mime ?? mime
//   if (getVaultItemTypeFromMime(resolvedMime) !== "image") return undefined

//   const localUri = normalizeImageUri(state.localUri)
//   const dataUri = normalizeImageUri(state.dataUri)

//   if (__DEV__) {
//     console.log("[attachment-preview-uri]", {
//       mime,
//       resolvedMime,
//       localUri,
//       dataUri,
//       using: isValidImageUri(localUri) ? "localUri" : isValidImageUri(dataUri) ? "dataUri" : "none",
//     })
//   }

//   if (isValidImageUri(localUri)) return localUri
//   if (isValidImageUri(dataUri)) return dataUri

//   return undefined
// }

export function getAttachmentPreviewImageUri( mime: string, state: Pick<AttachmentUiState, "dataUri" | "localUri" | "mime">, ): string | undefined { 
  const resolvedMime = state.mime ?? mime 
  if (getVaultItemTypeFromMime(resolvedMime) !== "image") 
    return undefined 
  const localUri = normalizeImageUri(state.localUri) 
  if (localUri) return localUri 
  const dataUri = normalizeImageUri(state.dataUri)
     if (dataUri) return dataUri 
  return undefined 
}
export function isValidImageUri(uri?: string): boolean {
  if (!uri) return false
  if (uri.startsWith("file://")) return true
  if (uri.startsWith("content://")) return true
  if (uri.startsWith("data:image")) return true
  if (uri.startsWith("http")) return true
  return false
}

function normalizeImageUri(uri?: string): string | undefined {
  if (!uri) return undefined
  const value = uri.trim()
  if (!value) return undefined
  if (value.startsWith("file://") || value.startsWith("content://") || value.startsWith("data:image/")) {
    return value
  }
  return undefined
}

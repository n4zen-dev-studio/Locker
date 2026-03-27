import * as FileSystem from "expo-file-system/legacy"
import { base64ToBytes, bytesToBase64 } from "@/locker/crypto/encoding"

const fileSystemCompat = FileSystem as any
const STORAGE_UNAVAILABLE_MESSAGE = "Attachment storage is unavailable on this platform."

export class AttachmentCacheUnavailableError extends Error {
  constructor(message = STORAGE_UNAVAILABLE_MESSAGE) {
    super(message)
    this.name = "AttachmentCacheUnavailableError"
  }
}

function resolveWritableRootDirectory(): string | null {
  const root = fileSystemCompat.documentDirectory ?? fileSystemCompat.cacheDirectory ?? null
  if (!root || typeof root !== "string") return null
  return root.endsWith("/") ? root : `${root}/`
}

function attachmentDir(vaultId: string, rootDir: string): string {
  return `${rootDir}locker/vaults/${vaultId}/att`
}

function attachmentPath(vaultId: string, attId: string, rootDir: string): string {
  return `${attachmentDir(vaultId, rootDir)}/${attId}.bin`
}

async function ensureDir(vaultId: string): Promise<string> {
  const rootDir = resolveWritableRootDirectory()
  if (!rootDir) {
    throw new AttachmentCacheUnavailableError()
  }
  const dir = attachmentDir(vaultId, rootDir)
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
  return dir
}

export async function writeEncryptedAttachment(
  vaultId: string,
  attId: string,
  bytes: Uint8Array,
): Promise<string> {
  const dir = await ensureDir(vaultId)
  const path = `${dir}/${attId}.bin`
  await FileSystem.writeAsStringAsync(path, bytesToBase64(bytes), {
    encoding: fileSystemCompat.EncodingType.Base64,
  })
  return path
}

export async function readEncryptedAttachment(
  vaultId: string,
  attId: string,
): Promise<Uint8Array | null> {
  const rootDir = resolveWritableRootDirectory()
  if (!rootDir) return null
  const path = attachmentPath(vaultId, attId, rootDir)
  const info = await FileSystem.getInfoAsync(path)
  if (!info.exists) return null
  const raw = await FileSystem.readAsStringAsync(path, {
    encoding: fileSystemCompat.EncodingType.Base64,
  })
  return base64ToBytes(raw)
}

export async function hasEncryptedAttachment(vaultId: string, attId: string): Promise<boolean> {
  const rootDir = resolveWritableRootDirectory()
  if (!rootDir) return false
  const path = attachmentPath(vaultId, attId, rootDir)
  const info = await FileSystem.getInfoAsync(path)
  return info.exists
}

export async function deleteEncryptedAttachment(vaultId: string, attId: string): Promise<void> {
  const rootDir = resolveWritableRootDirectory()
  if (!rootDir) return
  const path = attachmentPath(vaultId, attId, rootDir)
  await FileSystem.deleteAsync(path, { idempotent: true })
}

export function getAttachmentCachePath(vaultId: string, attId: string): string | null {
  const rootDir = resolveWritableRootDirectory()
  if (!rootDir) return null
  return attachmentPath(vaultId, attId, rootDir)
}

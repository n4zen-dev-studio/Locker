import * as FileSystem from "expo-file-system"
import { base64ToBytes, bytesToBase64 } from "@/locker/crypto/encoding"

const ROOT_DIR = `${FileSystem.documentDirectory ?? ""}locker/vaults`

function attachmentDir(vaultId: string): string {
  return `${ROOT_DIR}/${vaultId}/att`
}

function attachmentPath(vaultId: string, attId: string): string {
  return `${attachmentDir(vaultId)}/${attId}.bin`
}

async function ensureDir(vaultId: string): Promise<string> {
  if (!FileSystem.documentDirectory) {
    throw new Error("Attachment cache unavailable on this platform")
  }
  const dir = attachmentDir(vaultId)
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
    encoding: FileSystem.EncodingType.Base64,
  })
  return path
}

export async function readEncryptedAttachment(
  vaultId: string,
  attId: string,
): Promise<Uint8Array | null> {
  if (!FileSystem.documentDirectory) return null
  const path = attachmentPath(vaultId, attId)
  const info = await FileSystem.getInfoAsync(path)
  if (!info.exists) return null
  const raw = await FileSystem.readAsStringAsync(path, {
    encoding: FileSystem.EncodingType.Base64,
  })
  return base64ToBytes(raw)
}

export async function hasEncryptedAttachment(vaultId: string, attId: string): Promise<boolean> {
  if (!FileSystem.documentDirectory) return false
  const path = attachmentPath(vaultId, attId)
  const info = await FileSystem.getInfoAsync(path)
  return info.exists
}

export async function deleteEncryptedAttachment(vaultId: string, attId: string): Promise<void> {
  if (!FileSystem.documentDirectory) return
  const path = attachmentPath(vaultId, attId)
  await FileSystem.deleteAsync(path, { idempotent: true })
}

export function getAttachmentCachePath(vaultId: string, attId: string): string {
  return attachmentPath(vaultId, attId)
}

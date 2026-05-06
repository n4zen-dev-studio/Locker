import fs from "fs/promises"
import path from "path"

const BASE_DIR = path.resolve(process.cwd(), ".data", "blobs")

export async function putBlob(vaultId: string, blobId: string, data: Buffer): Promise<string> {
  const dir = path.join(BASE_DIR, vaultId)
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, `${blobId}.bin`)
  await fs.writeFile(filePath, data)
  return filePath
}

export async function getBlob(vaultId: string, blobId: string): Promise<Buffer> {
  const filePath = path.join(BASE_DIR, vaultId, `${blobId}.bin`)
  return fs.readFile(filePath)
}

export async function deleteBlob(vaultId: string, blobId: string): Promise<void> {
  const filePath = path.join(BASE_DIR, vaultId, `${blobId}.bin`)
  await fs.rm(filePath, { force: true })
}

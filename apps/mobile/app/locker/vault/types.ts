export const VAULT_CLASSIFICATIONS = [
  "Personal",
  "Financial",
  "Identity",
  "Credentials",
  "Legal",
  "Private",
  "Archive",
] as const

export type VaultClassification = (typeof VAULT_CLASSIFICATIONS)[number]

export const DEFAULT_VAULT_CLASSIFICATION: VaultClassification = "Personal"

export const VAULT_ITEM_TYPES = ["note", "image", "pdf", "doc", "voice"] as const

export type VaultItemType = (typeof VAULT_ITEM_TYPES)[number]

export type VaultImportType = "image" | "pdf" | "file" | "voice"

export function isSensitiveClassification(classification: VaultClassification): boolean {
  return classification !== "Archive" && classification !== "Personal"
}

export function getVaultItemTypeFromMime(mime: string): VaultItemType {
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf") return "pdf"
  if (mime.startsWith("audio/")) return "voice"
  return "doc"
}

export function getVaultItemTypeFromImportType(importType: VaultImportType): VaultItemType {
  if (importType === "file") return "doc"
  return importType
}

export function getVaultItemLabel(itemType: VaultItemType): string {
  if (itemType === "note") return "Secure Note"
  if (itemType === "image") return "Secure Image"
  if (itemType === "pdf") return "Secure PDF"
  if (itemType === "voice") return "Secure Voice"
  return "Secure Document"
}

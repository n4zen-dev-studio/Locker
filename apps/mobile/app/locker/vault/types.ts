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

export function isSensitiveClassification(classification: VaultClassification): boolean {
  return classification !== "Archive" && classification !== "Personal"
}

export function getVaultItemTypeFromMime(mime: string): "image" | "pdf" | "file" {
  if (mime.startsWith("image/")) return "image"
  if (mime === "application/pdf") return "pdf"
  return "file"
}

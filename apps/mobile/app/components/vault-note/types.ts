import type { VaultItemType } from "@/locker/vault/types"

export type VaultThemed = ReturnType<typeof import("@/theme/context").useAppTheme>["themed"]
export type VaultTheme = ReturnType<typeof import("@/theme/context").useAppTheme>["theme"]

export type AttachmentUiState = {
  status: "idle" | "downloading" | "ready" | "error" | "corrupt"
  dataUri?: string
  localUri?: string
  previewText?: string
  filename?: string
  mime?: string
  error?: string
}

export type ViewerState = {
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

import { Image, Pressable, View, type ImageStyle, type TextStyle, type ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { FileText, Image as LucideImage, Mic, Paperclip } from "lucide-react-native"

import { Text } from "@/components/Text"
import type { NoteAttachment } from "@/locker/storage/notesRepo"
import { getVaultItemTypeFromMime } from "@/locker/vault/types"
import type { ThemedStyle } from "@/theme/types"

import type { AttachmentUiState, VaultThemed } from "./types"
import { formatBytes } from "./utils"

type Props = {
  themed: VaultThemed
  att: NoteAttachment
  state: AttachmentUiState
  selected?: boolean
  onSelect: () => void
  onOpen: () => void
  onDownload: () => void
  onRemove: () => void
  canEdit: boolean
}

export function AttachmentRow(props: Props) {
  const { themed, att, state, selected, onSelect, onOpen, onDownload, onRemove, canEdit } = props
  const itemType = getVaultItemTypeFromMime(att.mime)
  const canRenderPreviewImage = itemType === "image" && !!state.dataUri

  return (
    <Pressable onPress={onSelect} style={themed([$attachmentCard, selected && $attachmentCardSelected])}>
      {canRenderPreviewImage ? (
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
          {state.status === "downloading"
            ? "Loading..."
            : state.status === "ready"
              ? itemType === "voice"
                ? "Play"
                : "Open"
              : "Get"}
        </Text>
      </Pressable>
      {canEdit ? (
        <Pressable style={themed($attachmentRemoveButton)} onPress={onRemove}>
          <Ionicons name="trash-outline" size={16} color="#FFB7C9" />
        </Pressable>
      ) : null}
    </Pressable>
  )
}

const $attachmentCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  padding: spacing.sm,
  borderRadius: 18,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $attachmentCardSelected: ThemedStyle<ViewStyle> = () => ({
  borderColor: "rgba(255,180,245,0.72)",
  backgroundColor: "rgba(255,255,255,0.05)",
})

const $attachmentImage: ThemedStyle<ImageStyle> = () => ({
  width: 54,
  height: 54,
  borderRadius: 14,
})

const $attachmentPlaceholder: ThemedStyle<ViewStyle> = () => ({
  width: 54,
  height: 54,
  borderRadius: 14,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.04)",
})

const $attachmentBody: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $attachmentName: ThemedStyle<TextStyle> = () => ({
  color: "#FFF3FF",
  fontSize: 12,
  fontWeight: "700",
})

const $attachmentMeta: ThemedStyle<TextStyle> = () => ({
  marginTop: 2,
  color: "rgba(255,235,255,0.62)",
  fontSize: 10,
})

const $attachmentError: ThemedStyle<TextStyle> = () => ({
  marginTop: 4,
  color: "#FFB4CA",
  fontSize: 10,
})

const $attachmentButton: ThemedStyle<ViewStyle> = () => ({
  paddingHorizontal: 12,
  paddingVertical: 9,
  borderRadius: 14,
  backgroundColor: "rgba(255,255,255,0.06)",
})

const $attachmentButtonText: ThemedStyle<TextStyle> = () => ({
  color: "#FFF2FF",
  fontSize: 11,
  fontWeight: "700",
})

const $attachmentRemoveButton: ThemedStyle<ViewStyle> = () => ({
  width: 34,
  height: 34,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,73,123,0.08)",
})

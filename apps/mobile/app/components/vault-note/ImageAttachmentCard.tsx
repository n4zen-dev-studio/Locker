import { useEffect, useState } from "react"
import { Image, Pressable, View, type ImageStyle, type TextStyle, type ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { Image as LucideImage } from "lucide-react-native"

import { Text } from "@/components/Text"
import type { NoteAttachment } from "@/locker/storage/notesRepo"
import type { ThemedStyle } from "@/theme/types"

import type { AttachmentUiState, VaultThemed } from "./types"
import { formatBytes, getAttachmentPreviewImageUri } from "./utils"

type Props = {
  themed: VaultThemed
  att: NoteAttachment
  state: AttachmentUiState
  selected?: boolean
  onOpen: () => void
  onPrepare: () => void
  onSelect: () => void
  onRemove: () => void
  canEdit: boolean
}

export function ImageAttachmentCard(props: Props) {
  const { themed, att, state, selected, onOpen, onPrepare, onSelect, onRemove, canEdit } = props
  const previewUri = getAttachmentPreviewImageUri(att.mime, state)
  const [previewFailed, setPreviewFailed] = useState(false)

  useEffect(() => {
    setPreviewFailed(false)
  }, [previewUri])

  useEffect(() => {
    if (!__DEV__) return
    console.log("[vault-note-render] ImageAttachmentCard", {
      attachmentId: att.id,
      mime: att.mime,
      previewUri,
      state,
      selected: !!selected,
    })
  }, [att.id, att.mime, previewUri, selected, state])

  return (
    <Pressable
      onPress={() => {
        onSelect()
        if (state.status === "ready") onOpen()
        else onPrepare()
      }}
      style={themed([$imageTile, selected && $imageTileSelected])}
    >
      {previewUri && !previewFailed ? (
        <Image
          source={{ uri: previewUri }}
          style={themed($imageTilePreview)}
          onError={() => {
            if (__DEV__) {
              console.log("[vault-attachment-preview] image card preview failed", {
                attachmentId: att.id,
                mime: att.mime,
                previewUri,
                state,
              })
            }
            setPreviewFailed(true)
          }}
        />
      ) : (
        <View style={themed($imageTilePlaceholder)}>
          <LucideImage size={22} color="#fff" />
          <Text style={themed($imageTileHint)}>
            {state.status === "downloading" ? "Loading" : "Preview"}
          </Text>
        </View>
      )}
      <View style={themed($imageTileFooter)}>
        <Text numberOfLines={1} style={themed($imageTileTitle)}>
          {att.filename ?? "Secure image"}
        </Text>
        <Text style={themed($imageTileMeta)}>{formatBytes(att.sizeBytes)}</Text>
      </View>
      {canEdit ? (
        <Pressable
          onPress={onRemove}
          style={themed($imageTileRemove)}
          hitSlop={8}
        >
          <Ionicons name="close" size={14} color="#fff" />
        </Pressable>
      ) : null}
    </Pressable>
  )
}

const $imageTile: ThemedStyle<ViewStyle> = () => ({
  width: "48%",
  borderRadius: 18,
  overflow: "hidden",
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $imageTileSelected: ThemedStyle<ViewStyle> = () => ({
  borderColor: "rgba(255,180,245,0.72)",
})

const $imageTilePreview: ThemedStyle<ImageStyle> = () => ({
  width: "100%",
  height: 128,
})

const $imageTilePlaceholder: ThemedStyle<ViewStyle> = () => ({
  width: "100%",
  height: 128,
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  backgroundColor: "rgba(255,255,255,0.03)",
})

const $imageTileHint: ThemedStyle<TextStyle> = () => ({
  color: "#F8EEFF",
  fontSize: 11,
})

const $imageTileFooter: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  gap: 2,
})

const $imageTileTitle: ThemedStyle<TextStyle> = () => ({
  color: "#FFF3FF",
  fontSize: 11,
  fontWeight: "700",
})

const $imageTileMeta: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,235,255,0.64)",
  fontSize: 10,
})

const $imageTileRemove: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  top: 10,
  right: 10,
  width: 26,
  height: 26,
  borderRadius: 13,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(8,8,12,0.62)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

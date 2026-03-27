import { View, type TextStyle, type ViewStyle } from "react-native"
import { Paperclip } from "lucide-react-native"

import { Text } from "@/components/Text"
import type { ThemedStyle } from "@/theme/types"

import type { VaultThemed } from "./types"

type Props = {
  themed: VaultThemed
  label: string
}

export function EmptyAttachmentState(props: Props) {
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

const $emptyAttachmentState: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.md,
  alignItems: "center",
  gap: spacing.xs,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.06)",
  backgroundColor: "rgba(255,255,255,0.03)",
})

const $emptyAttachmentIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 42,
  height: 42,
  borderRadius: 16,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.06)",
})

const $emptyAttachmentTitle: ThemedStyle<TextStyle> = () => ({
  color: "#FFF2FF",
  fontSize: 13,
  fontWeight: "700",
})

const $emptyAttachmentSubtitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,238,255,0.68)",
  fontSize: 11,
  textAlign: "center",
  lineHeight: 16,
  maxWidth: 240,
})

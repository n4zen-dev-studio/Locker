import { Pressable, View, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import type { ThemedStyle } from "@/theme/types"

import type { VaultThemed } from "./types"

type Props = { themed: VaultThemed; label: string, onPress?: () => void }

export function DescriptionChip(props: Props) {
  const { themed, label, onPress } = props
  return (
    <Pressable style={themed($metaChip)} onPress={onPress} >
      <Text style={themed($metaChipText)} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

const $metaChip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: 2,
  borderRadius: 20,
  backgroundColor: "rgba(255,255,255,0.05)",
//   borderWidth: 1,
//   borderColor: "rgba(255,255,255,0.08)",
  maxWidth: "100%",
})

const $metaChipText: ThemedStyle<TextStyle> = () => ({
  color: "#F7EFFF",
  fontSize: 10.5,
})

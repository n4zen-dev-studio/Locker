import { View, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import type { ThemedStyle } from "@/theme/types"

import type { VaultThemed } from "./types"

type Props = { themed: VaultThemed; label: string }

export function MetaChip(props: Props) {
  const { themed, label } = props
  return (
    <View style={themed($metaChip)}>
      <Text style={themed($metaChipText)} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const $metaChip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  maxWidth: "100%",
})

const $metaChipText: ThemedStyle<TextStyle> = () => ({
  color: "#F7EFFF",
  fontSize: 11,
})

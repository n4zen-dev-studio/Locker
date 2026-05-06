import { View, type TextStyle, type ViewStyle } from "react-native"

import { Text } from "@/components/Text"
import type { ThemedStyle } from "@/theme/types"

import type { VaultThemed } from "./types"

type Props = {
  themed: VaultThemed
  title: string
  subtitle?: string
  icon?: React.ReactNode
  rightSlot?: React.ReactNode
  children: React.ReactNode
}

export function GlassSection(props: Props) {
  const { themed, title, subtitle, icon, rightSlot, children } = props
  return (
    <View style={themed($sectionCard)}>
      <View style={themed($sectionHeader)}>
        <View style={themed($sectionHeaderLeft)}>
          {icon ? <View style={themed($sectionIconWrap)}>{icon}</View> : null}
          <View style={themed($sectionHeaderText)}>
            <Text style={themed($sectionTitle)}>{title}</Text>
            {subtitle ? <Text style={themed($sectionSubtitle)}>{subtitle}</Text> : null}
          </View>
        </View>
        {rightSlot}
      </View>
      {children}
    </View>
  )
}

const $sectionCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.sm,
  borderRadius: 20,
  gap: spacing.sm,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $sectionHeader: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
})

const $sectionHeaderLeft: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  flexDirection: "row",
  alignItems: "center",
  gap: 10,
})

const $sectionIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 32,
  height: 32,
  borderRadius: 12,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.07)",
})

const $sectionHeaderText: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $sectionTitle: ThemedStyle<TextStyle> = () => ({
  color: "#FFF0FF",
  fontSize: 14,
  fontWeight: "700",
})

const $sectionSubtitle: ThemedStyle<TextStyle> = () => ({
  marginTop: 2,
  color: "rgba(255,236,255,0.68)",
  fontSize: 11,
  lineHeight: 16,
})

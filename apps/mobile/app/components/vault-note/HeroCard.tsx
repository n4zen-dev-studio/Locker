import { Pressable, View, type TextStyle, type ViewStyle } from "react-native"
import { Download, LockKeyhole, Shield } from "lucide-react-native"

import { Text } from "@/components/Text"
import type { VaultItemType } from "@/locker/vault/types"
import type { ThemedStyle } from "@/theme/types"

import type { VaultThemed } from "./types"

type Props = {
  themed: VaultThemed
  title: string
  subtitle: string
  itemType: VaultItemType
  scopeLabel: string
  canExport: boolean
  onExport: () => void
  icon: React.ReactNode
}

export function HeroCard(props: Props) {
  const { themed, title, subtitle, itemType, scopeLabel, canExport, onExport, icon } = props
  return (
    <View style={themed($heroCard)}>
      <View style={themed($heroTopRow)}>
        <View style={themed($heroBadge)}>
          <Shield size={13} color="#FFD8FA" />
          <Text style={themed($heroBadgeText)}>{itemType.toUpperCase()}</Text>
        </View>
        <View style={themed($heroControls)}>
          <View style={themed($rolePill)}>
            <LockKeyhole size={12} color="#FCE7FF" />
            <Text style={themed($rolePillText)}>{scopeLabel}</Text>
          </View>
          <Pressable onPress={onExport} disabled={!canExport} style={themed($downloadPill)}>
            <Download size={14} color="#0d0a14" />
            <Text style={themed($downloadPillText)}>Export</Text>
          </Pressable>
        </View>
      </View>

      <View style={themed($heroTitleRow)}>
        <View style={themed($heroIconWrap)}>{icon}</View>
        <View style={themed($heroTextWrap)}>
          <Text style={themed($heroTitle)}>{title}</Text>
          <Text style={themed($heroSubtitle)}>{subtitle}</Text>
        </View>
      </View>
    </View>
  )
}

const $heroCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.sm,
  padding: spacing.sm,
  borderRadius: 20,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.09)",
  overflow: "hidden",
})

const $heroTopRow: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 10,
})

const $heroBadge: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  paddingHorizontal: 8,
  paddingVertical: 5,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $heroBadgeText: ThemedStyle<TextStyle> = () => ({
  color: "#F8DFFF",
  fontSize: 10,
  fontWeight: "700",
})

const $heroControls: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})

const $rolePill: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  paddingHorizontal: 8,
  paddingVertical: 5,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $rolePillText: ThemedStyle<TextStyle> = () => ({
  color: "#F9E7FF",
  fontSize: 10,
  textTransform: "capitalize",
})

const $downloadPill: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 5,
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
  backgroundColor: "#E8FF8A",
})

const $downloadPillText: ThemedStyle<TextStyle> = () => ({
  color: "#0d0a14",
  fontSize: 11,
  fontWeight: "700",
})

const $heroTitleRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
})

const $heroIconWrap: ThemedStyle<ViewStyle> = () => ({
  width: 48,
  height: 48,
  borderRadius: 18,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.08)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
})

const $heroTextWrap: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $heroTitle: ThemedStyle<TextStyle> = () => ({
  color: "#FFF7FF",
  fontSize: 20,
  fontWeight: "700",
})

const $heroSubtitle: ThemedStyle<TextStyle> = () => ({
  marginTop: 4,
  color: "rgba(255,235,255,0.72)",
  fontSize: 12,
  lineHeight: 18,
})

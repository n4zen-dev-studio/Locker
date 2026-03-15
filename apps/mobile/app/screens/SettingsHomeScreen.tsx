import { FC } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { GlassCard } from "@/components/GlassCard"
import { GlassHeader } from "@/components/GlassHeader"
import { AnimatedBlobBackground } from "@/components/AnimatedBlobBackground"
import type { SettingsStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const SettingsHomeScreen: FC<SettingsStackScreenProps<"SettingsHome">> =
  function SettingsHomeScreen(props) {
    const { navigation } = props
    const { themed } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

    return (
      <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
        <AnimatedBlobBackground>
          <View style={themed($headerWrap)}>
            <GlassHeader>
              <Text preset="heading" style={themed($title)}>
                Settings
              </Text>
              <Text preset="subheading" style={themed($subtitle)}>
                Device, sync, diagnostics, and vault preferences
              </Text>
            </GlassHeader>
          </View>

          <View style={themed($content)}>
            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Sync & Device
              </Text>
              <SettingsLink
                label="Sync Setup"
                description="Manage your single personal vault connection."
                onPress={() => navigation.navigate("RemoteVault")}
              />
              <SettingsLink
                label="Link Device"
                description="Pair this device with your account."
                onPress={() => navigation.navigate("VaultLinkDevice")}
              />
              <SettingsLink
                label="Account & Server"
                description="Connection status, server URL, and demo-safe account state."
                onPress={() => navigation.navigate("Profile")}
              />
            </GlassCard>

            <GlassCard>
              <Text preset="bold" style={themed($sectionTitle)}>
                Vault Tools
              </Text>
              <SettingsLink
                label="Recovery"
                description="Review recovery backup health and key continuity actions."
                onPress={() => navigation.navigate("VaultRecovery")}
              />
              <SettingsLink
                label="Diagnostics"
                description="Inspect non-secret technical state for portfolio demos."
                onPress={() => navigation.navigate("VaultDiagnostics")}
              />
            </GlassCard>
          </View>
        </AnimatedBlobBackground>
      </Screen>
    )
  }

const SettingsLink = ({
  label,
  description,
  onPress,
}: {
  label: string
  description: string
  onPress: () => void
}) => {
  const { themed } = useAppTheme()

  return (
    <Pressable style={({ pressed }) => [themed($linkCard), pressed && themed($linkCardPressed)]} onPress={onPress}>
      <Text preset="bold" style={themed($linkTitle)}>
        {label}
      </Text>
      <Text style={themed($linkDescription)}>{description}</Text>
    </Pressable>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
})

const $headerWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
  marginBottom: spacing.md,
})

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
  gap: spacing.lg,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textStrong,
  marginBottom: spacing.sm,
})

const $linkCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  padding: spacing.md,
  marginTop: spacing.sm,
  gap: spacing.xs,
})

const $linkCardPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.82,
})

const $linkTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $linkDescription: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  lineHeight: 20,
})

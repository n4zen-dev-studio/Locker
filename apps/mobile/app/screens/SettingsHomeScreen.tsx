import { FC } from "react"
import { Alert, Pressable, TextStyle, View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { GlassCard } from "@/components/GlassCard"
import { GlassHeader } from "@/components/GlassHeader"
import { AnimatedBlobBackground } from "@/components/AnimatedBlobBackground"
import { resetPrivacyOnboarding } from "@/locker/storage/onboardingRepo"
import type { SettingsStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const SettingsHomeScreen: FC<SettingsStackScreenProps<"SettingsHome">> =
  function SettingsHomeScreen(props) {
    const { navigation } = props
    const { themed } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

    const handleReplayOnboarding = () => {
      Alert.alert(
        "Replay onboarding",
        "This will reopen the privacy onboarding flow without changing your vault data.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Replay",
            onPress: () => {
              resetPrivacyOnboarding()
              navigation.navigate("VaultOnboarding")
            },
          },
        ],
      )
    }

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
                description="Manage the single personal vault that syncs to your account."
                onPress={() => navigation.navigate("RemoteVault")}
              />
              <SettingsLink
                label="Link Device"
                description="Redeem a trusted-device link and attach this phone to your account."
                onPress={() => navigation.navigate("VaultLinkDevice")}
              />
              <SettingsLink
                label="Server URL"
                description="Configure the API endpoint used for linking and personal-vault sync."
                onPress={() => navigation.navigate("ServerUrl")}
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
                label="Export & Diagnostics"
                description="Share demo-safe diagnostics and export an encrypted vault backup."
                onPress={() => navigation.navigate("VaultDiagnostics")}
              />
              <SettingsLink
                label="Threat Model"
                description="Read what Locker protects against, what it does not, and the security tradeoffs."
                onPress={() => navigation.navigate("ThreatModel")}
              />
              <SettingsLink
                label="Replay Onboarding"
                description="Run the privacy-first onboarding flow again from Settings."
                onPress={handleReplayOnboarding}
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

import { FC } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ensureNewUserBootstrap } from "@/locker/bootstrap/bootstrapService"
import { AnimatedBlobBackground } from "@/components/AnimatedBlobBackground"
import { completePrivacyOnboarding } from "@/locker/storage/onboardingRepo"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultOnboardingScreen: FC<AppStackScreenProps<"VaultOnboarding">> =
  function VaultOnboardingScreen(props) {
    const { navigation } = props
    const { themed } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

    const handleContinue = async () => {
      await ensureNewUserBootstrap()
      completePrivacyOnboarding()
      navigation.replace("VaultTabs", { screen: "Vault" })
    }

    const handleExistingUser = () => {
      completePrivacyOnboarding()
      navigation.replace("VaultLinkDevice")
    }

    return (
      <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
        <AnimatedBlobBackground>
          <View style={themed($card)}>
            <Text preset="heading" style={themed($title)}>
              Set Up Locker
            </Text>
            <Text preset="subheading" style={themed($subtitle)}>
              Locker stays hidden behind the calculator while your vaults sync only across your own devices.
            </Text>

            <View style={themed($section)}>
              <Text style={themed($bullet)}>A Personal vault is the default first setup.</Text>
              <Text style={themed($bullet)}>Each vault keeps its own encryption key.</Text>
              <Text style={themed($bullet)}>You can later choose which vaults live on each device.</Text>
            </View>

            <Pressable style={themed($primaryButton)} onPress={() => void handleContinue()}>
              <Text preset="bold" style={themed($primaryButtonText)}>
                Create New Locker Setup
              </Text>
            </Pressable>

            <Pressable style={themed($secondaryButton)} onPress={handleExistingUser}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                I Already Use Locker
              </Text>
            </Pressable>
          </View>
        </AnimatedBlobBackground>
      </Screen>
    )
  }

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.background,
  justifyContent: "center",
  paddingHorizontal: spacing.xl,
})

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(8, 14, 22, 0.84)",
  borderRadius: 24,
  padding: spacing.xl,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  gap: spacing.md,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
})

const $bullet: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  lineHeight: 22,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  marginTop: spacing.sm,
  backgroundColor: colors.accentPink,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.18)",
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

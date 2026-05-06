import { FC } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
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

    const handleContinue = () => {
      completePrivacyOnboarding()
      navigation.replace("VaultTabs", { screen: "Vault" })
    }

    return (
      <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
        <AnimatedBlobBackground>
          <View style={themed($card)}>
            <Text preset="heading" style={themed($title)}>
              Privacy First
            </Text>
            <Text preset="subheading" style={themed($subtitle)}>
              Your vault stays hidden behind the calculator and unlocks only with your device passkey.
            </Text>

            <View style={themed($section)}>
              <Text style={themed($bullet)}>The calculator remains the public face of the app.</Text>
              <Text style={themed($bullet)}>Vault content is encrypted before storage and sync.</Text>
              <Text style={themed($bullet)}>Security-sensitive actions will layer on stricter checks next.</Text>
            </View>

            <Pressable style={themed($primaryButton)} onPress={handleContinue}>
              <Text preset="bold" style={themed($primaryButtonText)}>
                Enter Vault
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

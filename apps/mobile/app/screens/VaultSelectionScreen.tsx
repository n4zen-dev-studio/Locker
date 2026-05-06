import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { AccessibilityInfo, Pressable, TextStyle, View, ViewStyle } from "react-native"
import Animated, { Easing, FadeInDown, FadeInUp } from "react-native-reanimated"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { VaultLockBackground } from "@/components/VaultLockBackground"
import { ensureNewUserBootstrap } from "@/locker/bootstrap/bootstrapService"
import { completeVaultSelectionFlow } from "@/locker/storage/onboardingRepo"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultSelectionScreen: FC<AppStackScreenProps<"VaultSelection">> =
  function VaultSelectionScreen(props) {
    const { navigation } = props
    const { themed } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"])
    const [reducedMotion, setReducedMotion] = useState(false)

    useEffect(() => {
      AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion)
      const subscription = AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setReducedMotion,
      )

      return () => subscription.remove()
    }, [])

    const handleCreateNew = useCallback(async () => {
      await ensureNewUserBootstrap()
      completeVaultSelectionFlow()
      navigation.replace("VaultTabs", { screen: "Vault" })
    }, [navigation])

    const handleLinkExisting = useCallback(() => {
      navigation.replace("VaultLinkDevice")
    }, [navigation])

    const handleRecoveryAccess = useCallback(() => {
      navigation.navigate("VaultRecoveryAccess")
    }, [navigation])

    const optionCards = useMemo(
      () => [
        {
          id: "new",
          eyebrow: "New Setup",
          title: "Create New Locker Setup",
          description: "Create your account on this device and start with your Personal vault.",
          onPress: () => void handleCreateNew(),
          actionLabel: "Continue",
          primary: true,
        },
        {
          id: "existing",
          eyebrow: "Existing Setup",
          title: "I Already Use Locker",
          description: "Link this device to your existing Locker account and bring over your vault access.",
          onPress: handleLinkExisting,
          actionLabel: "Link device",
          primary: false,
        },
        {
          id: "recovery",
          eyebrow: "Recovery Access",
          title: "Use Recovery Key",
          description: "Recover vault access with a saved recovery key and continue linking this device securely.",
          onPress: handleRecoveryAccess,
          actionLabel: "Use key",
          primary: false,
        },
      ],
      [handleCreateNew, handleLinkExisting, handleRecoveryAccess],
    )

    return (
      <Screen
        preset="fixed"
        contentContainerStyle={themed([$screen, $insets])}
        systemBarStyle="light"
      >
        <VaultLockBackground reducedMotion={reducedMotion} />

        <Animated.View
          entering={
            reducedMotion
              ? undefined
              : FadeInDown.duration(420).easing(Easing.bezier(0.22, 1, 0.36, 1))
          }
          style={themed($header)}
        >
          <Text size="xs" style={themed($eyebrow)}>
            Locker
          </Text>
          <Text preset="heading" style={themed($title)}>
            Choose Your Setup
          </Text>
          <Text style={themed($subtitle)}>
            Finish setting up this device before entering your vaults.
          </Text>
        </Animated.View>

     {__DEV__&& <Pressable style={themed([
              $actionPill,
              $actionPillPrimary
            ])}
            onPress={() => navigation.navigate('ServerUrl')}
          >
        <Text
          style={themed([
            $actionPillText,
            $actionPillTextPrimary
          ])}
        >
          Change URL
        </Text>
        </Pressable>}


        <Animated.View
          entering={
            reducedMotion
              ? undefined
              : FadeInUp.duration(460).easing(Easing.bezier(0.22, 1, 0.36, 1))
          }
          style={themed($content)}
        >
          <View style={themed($optionsColumn)}>
            {optionCards.map((option, index) => (
              <Animated.View
                key={option.id}
                entering={
                  reducedMotion
                    ? undefined
                    : FadeInUp.delay(100 + index * 80)
                        .duration(420)
                        .easing(Easing.bezier(0.22, 1, 0.36, 1))
                }
              >
                <Pressable
                  onPress={option.onPress}
                  style={themed([
                    $optionCard,
                    option.primary ? $optionCardPrimary : $optionCardSecondary,
                  ])}
                >
                  <View style={themed($optionHeader)}>
                    <Text size="xs" style={themed($optionEyebrow)}>
                      {option.eyebrow}
                    </Text>
                    <Text preset="subheading" style={themed($optionTitle)}>
                      {option.title}
                    </Text>
                  </View>

                  <Text style={themed($optionDescription)}>{option.description}</Text>

                  <View
                    style={themed([
                      $actionPill,
                      option.primary ? $actionPillPrimary : $actionPillSecondary,
                    ])}
                  >
                    <Text
                      style={themed([
                        $actionPillText,
                        option.primary ? $actionPillTextPrimary : $actionPillTextSecondary,
                      ])}
                    >
                      {option.actionLabel}
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
              </View>



          <View style={themed($footerNoteWrap)}>
            <Text style={themed($footerNote)}>
              Create a new Locker setup here or link this device to the Locker account you already use.
            </Text>
          </View>
        </Animated.View>

        
      </Screen>
    )
  }

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.vault.vaultBg,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.sm,
  paddingBottom: spacing.lg,
  justifyContent: "space-between",
  overflow: "hidden",
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingTop: spacing.md,
  gap: spacing.xs,
})

const $eyebrow: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextPrimary,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.3,
  marginBottom: 6,
})

const $title: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextPrimary,
  fontFamily: typography.primary.bold,
  textAlign: "center",
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextSecondary,
  fontFamily: typography.primary.normal,
  textAlign: "center",
  fontSize: 13,
  lineHeight: 19,
  maxWidth: 340,
  marginTop: 4,
})

const $content: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
})

const $optionsColumn: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
})

const $optionCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 28,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.lg,
  borderWidth: 1,
  overflow: "hidden",
  minHeight: 172,
  justifyContent: "space-between",
})

const $optionCardPrimary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.vault.vaultBgTint,
  borderColor: colors.vault.vaultRing,
})

const $optionCardSecondary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.04)",
  borderColor: colors.vault.vaultRing,
})

const $optionHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
})

const $optionEyebrow: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultAccentPinkSoft,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.2,
})

const $optionTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vault.vaultTextPrimary,
})

const $optionDescription: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextSecondary,
  fontFamily: typography.primary.normal,
  lineHeight: 20,
})

const $actionPill: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "flex-start",
  borderRadius: 999,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.xs,
})

const $actionPillPrimary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.vault.vaultTextPrimary,
})

const $actionPillSecondary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.vault.vaultBgTint,
})

const $actionPillText: ThemedStyle<TextStyle> = ({ typography }) => ({
  fontFamily: typography.primary.medium,
  fontSize: 13,
})

const $actionPillTextPrimary: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vault.vaultBg,
})

const $actionPillTextSecondary: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vault.vaultTextPrimary,
})

const $footerNoteWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.lg,
  alignItems: "center",
})

const $footerNote: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextSecondary,
  fontFamily: typography.primary.normal,
  textAlign: "center",
  fontSize: 12,
  lineHeight: 18,
  maxWidth: 320,
})

import { FC } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { GlassCard } from "@/components/GlassCard"
import { GlassHeader } from "@/components/GlassHeader"
import { AnimatedBlobBackground } from "@/components/AnimatedBlobBackground"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const ThreatModelScreen: FC<AppStackScreenProps<"ThreatModel">> = function ThreatModelScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <AnimatedBlobBackground>
        <View style={themed($headerWrap)}>
          <GlassHeader>
            <Text preset="heading" style={themed($title)}>
              Threat Model
            </Text>
            <Text preset="subheading" style={themed($subtitle)}>
              What Locker is designed to protect, and where its limits are.
            </Text>
          </GlassHeader>
        </View>

        <View style={themed($content)}>
          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Protects Against
            </Text>
            <Text style={themed($bodyText)}>
              Casual shoulder-surfing and opportunistic discovery through the calculator disguise.
            </Text>
            <Text style={themed($bodyText)}>
              Local disclosure when someone can browse app storage but does not control your unlocked device session.
            </Text>
            <Text style={themed($bodyText)}>
              Cloud-side metadata exposure by encrypting vault content before sync.
            </Text>
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Does Not Protect Against
            </Text>
            <Text style={themed($bodyText)}>
              Full device compromise, malware, or a rooted device reading memory while the vault is unlocked.
            </Text>
            <Text style={themed($bodyText)}>
              A coercive attacker who can force you to unlock the real vault or observe your passkey flow.
            </Text>
            <Text style={themed($bodyText)}>
              Unsafe sharing after export. Once exported, the destination and transport are outside Locker&apos;s control.
            </Text>
          </GlassCard>

          <GlassCard>
            <Text preset="bold" style={themed($sectionTitle)}>
              Security Tradeoffs
            </Text>
            <Text style={themed($bodyText)}>
              Passkey-only unlock removes PIN fallback, which reduces secret sprawl but increases permanent lockout risk if device trust is lost.
            </Text>
            <Text style={themed($bodyText)}>
              Recovery backup helps key continuity, but only if the passphrase is stored separately and updated deliberately.
            </Text>
            <Text style={themed($bodyText)}>
              Sync is limited to one personal vault to keep state paths simple and reduce account-switching mistakes.
            </Text>
          </GlassCard>

          <Pressable style={themed($primaryButton)} onPress={() => navigation.goBack()}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              Back to Settings
            </Text>
          </Pressable>
        </View>
      </AnimatedBlobBackground>
    </Screen>
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

const $bodyText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  lineHeight: 22,
  marginTop: spacing.xs,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.accentPink,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

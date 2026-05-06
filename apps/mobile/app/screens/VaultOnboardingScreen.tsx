import { FC } from "react";
import {
  AccessibilityInfo,
  Pressable,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { VaultLockBackground } from "@/components/VaultLockBackground";
import { ensureNewUserBootstrap } from "@/locker/bootstrap/bootstrapService";
import { completePrivacyOnboarding } from "@/locker/storage/onboardingRepo";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";
import { useEffect, useMemo, useState } from "react";

export const VaultOnboardingScreen: FC<AppStackScreenProps<"VaultOnboarding">> =
  function VaultOnboardingScreen(props) {
    const { navigation } = props;
    const { themed } = useAppTheme();
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);
    const [reducedMotion, setReducedMotion] = useState(false);

    useEffect(() => {
      AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
      const subscription = AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setReducedMotion,
      );

      return () => subscription.remove();
    }, []);

    const handleContinue = async () => {
      await ensureNewUserBootstrap();
      completePrivacyOnboarding();
      navigation.replace("VaultTabs", { screen: "Vault" });
    };

    const handleExistingUser = () => {
      completePrivacyOnboarding();
      navigation.replace("VaultLinkDevice");
    };

    const optionCards = useMemo(
      () => [
        {
          id: "new",
          eyebrow: "New Setup",
          title: "Create New Locker Setup",
          description:
            "Start fresh on this device and create your Personal vault.",
          onPress: () => void handleContinue(),
          primary: true,
        },
        {
          id: "existing",
          eyebrow: "Existing Setup",
          title: "I Already Use Locker",
          description:
            "Link this device to an existing Locker setup and bring over access to your current personal vault.",
          onPress: handleExistingUser,
          primary: false,
        },
      ],
      [],
    );

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
            Get Started
          </Text>
          <Text style={themed($subtitle)}>
             Choose your Locker setup
          </Text>
        </Animated.View>

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
                    <Text
                      preset="subheading"
                      style={themed($optionTitle)}
                    >
                      {option.title}
                    </Text>
                  </View>

                  <Text style={themed($optionDescription)}>
                    {option.description}
                  </Text>

                  <View
                    style={themed([
                      $actionPill,
                      option.primary
                        ? $actionPillPrimary
                        : $actionPillSecondary,
                    ])}
                  >
                    <Text
                      style={themed([
                        $actionPillText,
                        option.primary
                          ? $actionPillTextPrimary
                          : $actionPillTextSecondary,
                      ])}
                    >
                      {option.primary ? "Continue" : "Link device"}
                    </Text>
                  </View>
                </Pressable>
              </Animated.View>
            ))}
          </View>

          <View style={themed($footerNoteWrap)}>
            <Text style={themed($footerNote)}>
              You can either create a new Locker on this device or
            link to one you already use elsewhere.
            </Text>
          </View>
        </Animated.View>
      </Screen>
    );
  };

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.vault.vaultBg,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.sm,
  paddingBottom: spacing.lg,
  justifyContent: "space-between",
  overflow: "hidden",
});

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingTop: spacing.md,
  gap: spacing.xs,
});

const $eyebrow: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextPrimary,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.3,
  marginBottom: 6,
});

const $title: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextPrimary,
  fontFamily: typography.primary.bold,
  textAlign: "center",
});

const $subtitle: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextSecondary,
  fontFamily: typography.primary.normal,
  textAlign: "center",
  fontSize: 13,
  lineHeight: 19,
  maxWidth: 340,
  marginTop: 4,
});

const $content: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "center",
});

const $optionsColumn: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $optionCard: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: 28,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.lg,
  borderWidth: 1,
  overflow: "hidden",
  minHeight: 172,
  justifyContent: "space-between",
});

const $optionCardPrimary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(17, 20, 30, 0.78)",
  borderColor: colors.vault.vaultBorderSubtle,
});

const $optionCardSecondary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: "rgba(12, 15, 24, 0.6)",
  borderColor: colors.vault.vaultRing,
});

const $optionHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
});

const $optionEyebrow: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultAccentPinkSoft,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.1,
});

const $optionTitle: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextPrimary,
  fontFamily: typography.primary.bold,
  fontSize: 20,
  lineHeight: 24,
});

const $optionDescription: ThemedStyle<TextStyle> = ({
  colors,
  typography,
}) => ({
  color: colors.vault.vaultTextSecondary,
  fontFamily: typography.primary.normal,
  fontSize: 13,
  lineHeight: 19,
  marginTop: 10,
});

const $actionPill: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "flex-start",
  marginTop: spacing.md,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: 999,
  minWidth: 128,
  alignItems: "center",
});

const $actionPillPrimary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.vault.vaultSurface,
  borderWidth: 1,
  borderColor: colors.vault.vaultBorderSubtle,
});

const $actionPillSecondary: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.vault.vaultBg,
  borderWidth: 1,
  borderColor: colors.vault.vaultRing,
});

const $actionPillText: ThemedStyle<TextStyle> = ({ typography }) => ({
  fontFamily: typography.primary.medium,
  textAlign: "center",
  fontSize: 13,
  lineHeight: 16,
});

const $actionPillTextPrimary: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vault.vaultAccentPinkSoft,
});

const $actionPillTextSecondary: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.vault.vaultTextPrimary,
});

const $footerNoteWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginTop: spacing.lg,
  paddingHorizontal: spacing.sm,
});

const $footerNote: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextSecondary,
  fontFamily: typography.primary.normal,
  textAlign: "center",
  fontSize: 12,
  lineHeight: 18,
  maxWidth: 330,
  opacity: 0.92,
});
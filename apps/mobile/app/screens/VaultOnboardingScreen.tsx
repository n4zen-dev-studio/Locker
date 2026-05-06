import { FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Dimensions,
  Image,
  ImageStyle,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import Animated, { Easing, FadeInDown, FadeInUp } from "react-native-reanimated";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { VaultLockBackground } from "@/components/VaultLockBackground";
import { isPasskeyEnabled } from "@/locker/auth/passkey";
import { vaultSession } from "@/locker/session";
import { markInitialOnboardingSeen } from "@/locker/storage/onboardingRepo";
import { getPostUnlockRoute } from "@/navigators/postUnlockRoute";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";
import { getMeta } from "@/locker/storage/vaultMetaRepo";

const { width: SCREEN_WIDTH } = Dimensions.get("window");


const AppLogo = require("@assets/images/logo.png")

type CarouselSlide = {
  id: string;
  title: string;
  body: string;
};

export const VaultOnboardingScreen: FC<AppStackScreenProps<"VaultOnboarding">> =
  function VaultOnboardingScreen(props) {
    const { navigation } = props;
    const { themed } = useAppTheme();
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

    const [reducedMotion, setReducedMotion] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const scrollRef = useRef<ScrollView | null>(null);

    useEffect(() => {
      markInitialOnboardingSeen();
      AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
      const subscription = AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setReducedMotion,
      );

      return () => subscription.remove();
    }, []);

    const slides = useMemo<CarouselSlide[]>(
      () => [
        {
          id: "hidden",
          title: "Hidden in plain sight",
          body:
            "Locker stays tucked behind your calculator, so your private space does not appear like a regular vault app on your device.",
        },
        {
          id: "security",
          title: "Only you can open it",
          body:
            "Your calculator PIN helps protect the hidden entry, while passkey and device biometrics add a stronger layer of secure unlock.",
        },
        {
          id: "transfer",
          title: "Move securely between devices",
          body:
            "You can transfer access from one device to another, so your Locker setup travels with you without exposing your data in plain form.",
        },
        {
          id: "zero-trust",
          title: "Encrypted end to end",
          body:
            "Locker uses a zero-trust approach with the server, meaning your data stays encrypted and unreadable outside your own trusted devices.",
        },
      ],
      [],
    );

    const handleContinue = useCallback(async () => {
      const passkeyReady = await isPasskeyEnabled();
      if (!passkeyReady) {
        const meta = getMeta();
        navigation.replace("VaultPasskeySetup", {
          mode: meta?.v === 1 ? "migrate" : "fresh",
        });
        return;
      }

      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked");
        return;
      }

      const next = getPostUnlockRoute();
      if (next.name === "VaultTabs") {
        navigation.replace("VaultTabs", next.params);
        return;
      }

      navigation.replace("VaultSelection");
    }, [navigation]);

    const handleNext = () => {
      if (currentIndex >= slides.length - 1) {
        void handleContinue();
        return;
      }

      const nextIndex = currentIndex + 1;
      scrollRef.current?.scrollTo({
        x: SCREEN_WIDTH * nextIndex,
        animated: true,
      });
      setCurrentIndex(nextIndex);
    };

    const handleSkip = () => {
      void handleContinue();
    };

    const onMomentumEnd = (
      event: NativeSyntheticEvent<NativeScrollEvent>,
    ) => {
      const x = event.nativeEvent.contentOffset.x;
      const index = Math.round(x / SCREEN_WIDTH);
      setCurrentIndex(index);
    };

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
        </Animated.View>

        <Animated.View
          entering={
            reducedMotion
              ? undefined
              : FadeInUp.duration(460).easing(Easing.bezier(0.22, 1, 0.36, 1))
          }
          style={themed($content)}
        >
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            bounces={false}
            onMomentumScrollEnd={onMomentumEnd}
            contentContainerStyle={themed($carouselContent)}
          >
            {slides.map((slide) => (
              <View key={slide.id} style={themed($slide)}>
                <View style={themed($visualWrap)}>
                  <View style={themed($glowHalo)} />
                  <View style={themed($imageShell)}>
                    <Image
                      source={AppLogo}
                      resizeMode="contain"
                      style={themed($placeholderImage)}
                    />
                  </View>
                </View>

                <View style={themed($copyWrap)}>
                  <Text preset="heading" style={themed($title)}>
                    {slide.title}
                  </Text>
                  <Text style={themed($body)}>{slide.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={themed($footer)}>
            <View style={themed($dotsRow)}>
              {slides.map((slide, index) => {
                const active = index === currentIndex;
                return (
                  <View
                    key={slide.id}
                    style={themed([$dot, active && $dotActive])}
                  />
                );
              })}
            </View>

            <View style={themed($buttonRow)}>
              <Pressable style={themed($secondaryButton)} onPress={handleSkip}>
                <Text style={themed($secondaryButtonText)}>
                  {currentIndex === slides.length - 1 ? "Close" : "Skip"}
                </Text>
              </Pressable>

              <Pressable style={themed($continueButton)} onPress={handleNext}>
                <Text style={themed($continueButtonText)}>
                  {currentIndex === slides.length - 1 ? "Continue" : "Next"}
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </Screen>
    );
  };

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.vault.vaultBg,
  paddingTop: spacing.sm,
  paddingBottom: spacing.lg,
  justifyContent: "space-between",
  overflow: "hidden",
});

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingTop: spacing.md,
  paddingHorizontal: spacing.lg,
  gap: spacing.xs,
});

const $eyebrow: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextPrimary,
  fontFamily: typography.primary.medium,
  textTransform: "uppercase",
  letterSpacing: 1.3,
  marginBottom: 6,
});

const $content: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  justifyContent: "space-between",
});

const $carouselContent: ThemedStyle<ViewStyle> = () => ({
  alignItems: "stretch",
});

const $slide: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: SCREEN_WIDTH,
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: spacing.xl,
});

const $visualWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: spacing.xl,
  minHeight: 280,
});

const $glowHalo: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  width: 220,
  height: 220,
  borderRadius: 999,
  backgroundColor: colors.vault.vaultAccentPinkSoft,
  opacity: 0.22,
  shadowColor: colors.vault.vaultAccentPinkSoft,
  shadowOpacity: 0.5,
  shadowRadius: 34,
  shadowOffset: { width: 0, height: 0 },
  elevation: 14,
});

const $imageShell: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 180,
  height: 180,
  borderRadius: 999,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(18, 20, 30, 0.5)",
  borderWidth: 1,
  borderColor: colors.vault.vaultRing,
});

const $placeholderImage: ThemedStyle<ImageStyle> = () => ({
  width: 104,
  height: 104,
});

const $copyWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.sm,
  maxWidth: 340,
});

const $title: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextPrimary,
  fontFamily: typography.primary.medium,
  textAlign: "center",
});

const $body: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextSecondary,
  fontFamily: typography.primary.normal,
  textAlign: "center",
  fontSize: 14,
  lineHeight: 21,
});

const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.md,
  gap: spacing.md,
});

const $dotsRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center",
  gap: spacing.xs,
});

const $dot: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 8,
  height: 8,
  borderRadius: 999,
  backgroundColor: "rgba(255,255,255,0.18)",
  borderWidth: 1,
  borderColor: colors.vault.vaultRing,
});

const $dotActive: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 22,
  backgroundColor: colors.vault.vaultAccentPinkSoft,
  borderColor: colors.vault.vaultAccentPinkSoft,
});

const $buttonRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
});

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  borderRadius: 999,
  paddingVertical: spacing.md,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.vault.vaultSurface,
  borderWidth: 1,
  borderColor: colors.vault.vaultBorderSubtle,
});

const $secondaryButtonText: ThemedStyle<TextStyle> = ({
  colors,
  typography,
}) => ({
  color: colors.vault.vaultTextPrimary,
  fontFamily: typography.primary.medium,
});

const $continueButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  borderRadius: 999,
  paddingVertical: spacing.md,
  alignItems: "center",
  justifyContent: "center",
    borderWidth: 1,
  backgroundColor: colors.vault.vaultBgTint,
  borderColor: colors.vault.vaultRing,
});

const $continueButtonText: ThemedStyle<TextStyle> = ({
  colors,
  typography,
}) => ({
  color: colors.text,
  fontFamily: typography.primary.bold,
});
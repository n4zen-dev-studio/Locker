import { FC, useCallback, useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Pressable,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
} from "react-native-reanimated";

import { BiometricUnlockOrb } from "@/components/BiometricUnlockOrb";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { VaultLockBackground } from "@/components/VaultLockBackground";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";
import { vaultSession } from "@/locker/session";
import { randomBytes } from "@/locker/crypto/random";
import { enablePasskey, isPasskeyEnabled } from "@/locker/auth/passkey";
import { getMeta } from "@/locker/storage/vaultMetaRepo";
import { getPostUnlockRoute } from "@/navigators/postUnlockRoute";
import { recordSecurityEvent } from "@/locker/security/auditLogRepo";

export const VaultPasskeySetupScreen: FC<
  AppStackScreenProps<"VaultPasskeySetup">
> = function VaultPasskeySetupScreen(props) {
  const { navigation, route } = props;
  const { themed } = useAppTheme();
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

  const [error, setError] = useState<string | null>(null);
  const [passkeyReady, setPasskeyReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [enabling, setEnabling] = useState(false);

  const mode = route.params?.mode ?? "fresh";
  const meta = useMemo(() => getMeta(), []);
  const needsLegacyUnlock = meta?.v === 1 && !vaultSession.isUnlocked();

  useEffect(() => {
    isPasskeyEnabled().then(setPasskeyReady);
  }, []);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );

    return () => subscription.remove();
  }, []);

  const handleEnable = async () => {
    setError(null);
    setEnabling(true);

    try {
      let vmk = vaultSession.getKey();

      if (!vmk) {
        if (needsLegacyUnlock) {
          setEnabling(false);
          Alert.alert(
            "Legacy Unlock Required",
            "Unlock with PIN first to migrate the vault.",
          );
          return;
        }

        vmk = randomBytes(32);
        vaultSession.setKey(vmk);
      }

      await enablePasskey(vmk);

      recordSecurityEvent({
        type: "passkey_enabled",
        message: "Passkey enabled for vault unlock.",
        severity: "info",
      });

      const next = getPostUnlockRoute();
      if (next.name === "VaultSelection") {
        navigation.replace("VaultSelection");
      } else {
        navigation.replace(next.name, next.params);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to enable passkey";
      setError(message);
    } finally {
      setEnabling(false);
    }
  };

  const helperText = useMemo(() => {
    if (mode === "migrate") {
      return "To enable passkey, unlock once with your legacy PIN.";
    }
    if (mode === "recovery") {
      return "Passkey setup is required to unlock this vault.";
    }
    return "Passkey keeps your vault tied to this device and protected by biometrics or screen lock.";
  }, [mode]);

  const titleText = useMemo(() => {
    if (mode === "migrate") return "Migrate to passkey";
    if (mode === "recovery") return "Set up passkey";
    return "Enable passkey";
  }, [mode]);

  const orbLabel = useMemo(() => {
    if (needsLegacyUnlock) {
      return "Unlock with PIN";
    }
    return enabling ? "Enabling..." : "Enable passkey";
  }, [needsLegacyUnlock, enabling]);

  const handleOrbPress = () => {
    if (needsLegacyUnlock) {
      navigation.navigate("VaultPin");
      return;
    }
    handleEnable();
  };

  return (
    <Screen
      preset="fixed"
      contentContainerStyle={themed([$screen, $insets])}
      keyboardAvoidingEnabled={false}
      systemBarStyle="light"
    >
      <VaultLockBackground reducedMotion={reducedMotion} />

      <Animated.View
        entering={
          reducedMotion
            ? undefined
            : FadeInDown.duration(420).easing(Easing.bezier(0.22, 1, 0.36, 1))
        }
        style={themed($headerRow)}
      >
        <Pressable
          style={themed($backButton)}
          onPress={() => navigation.goBack()}
        >
          <Text style={themed($backButtonText)}>‹ Back</Text>
        </Pressable>

        <View style={themed($headerCopy)}>
          <Text size="xs" style={themed($eyebrow)}>
            Locker
          </Text>
          <Text style={themed($subtitle)}>Setup secure unlock for this device</Text>
        </View>
      </Animated.View>

      <View style={themed($centerStage)}>
        <Animated.View
          entering={
            reducedMotion
              ? undefined
              : FadeIn.duration(340).easing(Easing.bezier(0.22, 1, 0.36, 1))
          }
        >
          <BiometricUnlockOrb
            onPress={handleOrbPress}
            authenticating={enabling}
            reducedMotion={reducedMotion}
            label={""}
          />
        </Animated.View>
      </View>

      <Animated.View
        entering={
          reducedMotion
            ? undefined
            : FadeInUp.duration(420).easing(Easing.bezier(0.22, 1, 0.36, 1))
        }
        style={themed($footer)}
      >
        <Text style={themed($helperText)}>{helperText}</Text>

        {error ? <Text style={themed($errorText)}>{error}</Text> : null}

        {!passkeyReady ? (
          <Text style={themed($hintText)}>
            If prompted, enable device lock or biometrics to continue.
          </Text>
        ) : null}

        {needsLegacyUnlock ? (
          <Pressable
            style={themed($secondaryButton)}
            onPress={() => navigation.navigate("VaultPin")}
          >
            <Text style={themed($secondaryButtonText)}>
              Unlock with PIN (Legacy)
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={themed($primaryButton)}
            onPress={handleEnable}
            disabled={enabling}
          >
            <Text style={themed($primaryButtonText)}>
              {enabling ? "Enabling..." : "Enable Passkey"}
            </Text>
          </Pressable>
        )}
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

const $headerRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: spacing.md,
});

const $backButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: 999,
  backgroundColor: colors.vault.vaultBg,
  borderWidth: 1,
  borderColor: colors.vault.vaultRing,
});

const $backButtonText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultAccentPinkSoft,
  fontFamily: typography.primary.medium,
  fontSize: 13,
  lineHeight: 16,
});

const $headerCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "flex-end",
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
  textAlign: "right",
});

const $subtitle: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextSecondary,
  fontFamily: typography.primary.normal,
  textAlign: "right",
  fontSize: 13,
  lineHeight: 18,
  marginTop: 6,
});

const $centerStage: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
});

const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.sm,
  paddingBottom: spacing.md,
});

const $helperText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextSecondary,
  fontFamily: typography.primary.normal,
  textAlign: "center",
  fontSize: 13,
  lineHeight: 18,
  maxWidth: 320,
});

const $errorText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultError,
  fontFamily: typography.primary.medium,
  textAlign: "center",
});

const $hintText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultTextSecondary,
  fontFamily: typography.primary.normal,
  textAlign: "center",
  fontSize: 12,
  lineHeight: 17,
  opacity: 0.9,
  maxWidth: 320,
});

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  marginTop: spacing.xs,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.sm,
  borderRadius: 999,
  backgroundColor: colors.vault.vaultSurface,
  borderWidth: 1,
  borderColor: colors.vault.vaultBorderSubtle,
  minWidth: 200,
  alignItems: "center",
});

const $primaryButtonText: ThemedStyle<TextStyle> = ({
  colors,
  typography,
}) => ({
  color: colors.vault.vaultAccentPinkSoft,
  fontFamily: typography.primary.medium,
  textAlign: "center",
});

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  marginTop: spacing.xs,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.sm,
  borderRadius: 999,
  backgroundColor: colors.vault.vaultSurface,
  borderWidth: 1,
  borderColor: colors.vault.vaultBorderSubtle,
  minWidth: 220,
  alignItems: "center",
});

const $secondaryButtonText: ThemedStyle<TextStyle> = ({
  colors,
  typography,
}) => ({
  color: colors.vault.vaultAccentPinkSoft,
  fontFamily: typography.primary.medium,
  textAlign: "center",
});

import { FC, useCallback, useEffect, useState } from "react";
import {
  AccessibilityInfo,
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
import { isPasskeyEnabled, unlockWithPasskey } from "@/locker/auth/passkey";
import { recordSecurityEvent } from "@/locker/security/auditLogRepo";
import { vaultSession } from "@/locker/session";
import { getMeta } from "@/locker/storage/vaultMetaRepo";
import { getPostUnlockRoute } from "@/navigators/postUnlockRoute";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";

export const VaultLockedScreen: FC<AppStackScreenProps<"VaultLocked">> =
  function VaultLockedScreen(props) {
    const { navigation } = props;
    const { themed } = useAppTheme();
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

    const [metaVersion, setMetaVersion] = useState<1 | 2 | null>(null);
    const [passkeyReady, setPasskeyReady] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reducedMotion, setReducedMotion] = useState(false);
    const [authenticating, setAuthenticating] = useState(false);

    const refreshState = useCallback(async () => {
      const meta = getMeta();
      setMetaVersion(meta ? meta.v : null);
      const enabled = await isPasskeyEnabled();
      setPasskeyReady(enabled);
    }, []);

    useEffect(() => {
      refreshState();
    }, [refreshState]);

    useEffect(() => {
      AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
      const subscription = AccessibilityInfo.addEventListener(
        "reduceMotionChanged",
        setReducedMotion,
      );

      return () => subscription.remove();
    }, []);

    const handlePasskey = async () => {
      setError(null);
      setAuthenticating(true);
      const meta = getMeta();
      if (!meta) {
        setAuthenticating(false);
        navigation.navigate("VaultPasskeySetup", { mode: "fresh" });
        return;
      }

      if (meta.v === 1) {
        if (!passkeyReady) {
          setAuthenticating(false);
          setError("Passkey not supported on this device");
          return;
        }
        setAuthenticating(false);
        navigation.navigate("VaultPasskeySetup", { mode: "migrate" });
        return;
      }

      if (!passkeyReady) {
        setAuthenticating(false);
        setError("Passkey not supported on this device");
        return;
      }

      try {
        const vmk = await unlockWithPasskey();
        vaultSession.setKey(vmk);
        recordSecurityEvent({
          type: "unlock_success",
          message: "Vault unlocked successfully.",
          severity: "info",
        });
        const next = getPostUnlockRoute();
        if (next.name === "VaultOnboarding") {
          navigation.replace("VaultOnboarding");
        } else {
          navigation.replace(next.name, next.params);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to unlock";
        recordSecurityEvent({
          type: "unlock_failure",
          message: "Vault unlock failed.",
          severity: "warning",
          meta: { message },
        });
        setError(message);
      } finally {
        setAuthenticating(false);
      }
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
          style={themed($headerRow)}
        >

          <View style={themed($headerCopy)}>
            <Text size="xs" style={themed($eyebrow)}>
              Locker
            </Text>
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
              onPress={handlePasskey}
              authenticating={authenticating}
              reducedMotion={reducedMotion}
              label={authenticating ? "Authenticating..." : "Unlock with biometrics"}
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
          {/* <Text style={themed($helperText)}>
            {authenticating
              ? "Authenticating..."
              : "Use Face ID, Touch ID, or your device lock"}
          </Text> */}

          

          {error ? <Text style={themed($errorText)}>{error}</Text> : null}

          <Pressable
              style={themed($backButton)}
              onPress={() => navigation.goBack()}
            >
              <Text style={themed($backButtonText)}>‹ Back</Text>
            </Pressable>

          {metaVersion === 1 ? (
            <Pressable
              style={themed($migrationButton)}
              onPress={() => navigation.navigate("VaultPin")}
            >
              <Text style={themed($migrationButtonText)}>Migrate legacy vault</Text>
            </Pressable>
          ) : null}
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
  fontSize: 13
});

const $errorText: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  color: colors.vault.vaultError,
  fontFamily: typography.primary.medium,
  textAlign: "center",
});

const $migrationButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  marginTop: spacing.xs,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  borderRadius: 999,
  backgroundColor: colors.vault.vaultSurface,
  borderWidth: 1,
  borderColor: colors.vault.vaultBorderSubtle,
});

const $migrationButtonText: ThemedStyle<TextStyle> = ({
  colors,
  typography,
}) => ({
  color: colors.vault.vaultAccentPinkSoft,
  fontFamily: typography.primary.medium,
  textAlign: "center",
});

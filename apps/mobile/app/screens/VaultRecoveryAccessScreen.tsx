import { FC, useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, TextStyle, View, ViewStyle } from "react-native";
import { KeyRound, Smartphone } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { GhostButton } from "@/components/vault-note/GhostButton";
import { GlassSection } from "@/components/vault-note/GlassSection";
import { GradientPrimaryButton } from "@/components/vault-note/GradientPrimaryButton";
import { IconTextInput } from "@/components/vault-note/IconTextInput";
import {
  VaultBanner,
  VaultScreenBackground,
  VaultScreenHero,
} from "@/components/vault-note/VaultScreenChrome";
import {
  fetchPublicRecoveryEnvelope,
  redeemRecoveryEnvelope,
} from "@/locker/recovery/recoveryApi";
import {
  createRecoveryProof,
  formatRecoveryKey,
  openRecoveryEnvelope,
  parseRecoveryKey,
} from "@/locker/recovery/recoveryKey";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";
import { getSuggestedDeviceName } from "@/utils/calc/DeviceInfo";

export const VaultRecoveryAccessScreen: FC<
  AppStackScreenProps<"VaultRecoveryAccess">
> = function VaultRecoveryAccessScreen(props) {
  const { navigation } = props;
  const { themed, theme } = useAppTheme();
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

  const [recoveryKey, setRecoveryKey] = useState("");
  const [deviceName, setDeviceName] = useState(
    Platform.OS === "ios" ? "Locker iPhone" : "Locker Android",
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

   useEffect(() => {
    getSuggestedDeviceName().then(setDeviceName)
  }, [])

  const handleRecover = useCallback(async () => {
    setError(null);
    setStatus(null);

    let parsed;
    try {
      parsed = parseRecoveryKey(recoveryKey);
    } catch {
      setError("Enter a valid recovery key.");
      return;
    }

    setBusy(true);
    try {
      setStatus("Validating recovery key...");
      const envelope = await fetchPublicRecoveryEnvelope(parsed.recoveryId);
      const vaultKey = openRecoveryEnvelope(envelope, parsed.canonicalKey);
      if (vaultKey.length !== 32) throw new Error("RECOVERY_FAILED");
      const proofB64 = createRecoveryProof(parsed.canonicalKey, envelope);
      setStatus("Linking this device...");
      await redeemRecoveryEnvelope({
        proofB64,
        vaultKey,
        envelope,
        deviceName,
      });
      (navigation.replace as (...args: unknown[]) => void)("VaultTabs");
    } catch {
      setError("Recovery failed. Check the key and try again.");
    } finally {
      setBusy(false);
    }
  }, [deviceName, navigation, recoveryKey]);

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <VaultScreenBackground />
      <ScrollView
        contentContainerStyle={themed($content)}
        showsVerticalScrollIndicator={false}
      >
        <VaultScreenHero
          themed={themed}
          badge="RECOVERY"
          title="Use Recovery Key"
          subtitle="Recover vault access on this device and continue through the normal device-link flow."
          icon={<KeyRound size={13} color="#FFD8FA" />}
          metaLabel={busy ? "Working" : "Ready"}
        />

        <GlassSection
          themed={themed}
          title="Recovery Access"
          subtitle="Enter the device label and the one-time recovery key exactly as saved."
          icon={<Smartphone size={14} color="#FFC8F3" />}
        >
          <View style={themed($fieldStack)}>
            <View style={themed($fieldGroup)}>
              <Text style={themed($label)}>Device name</Text>
              <IconTextInput
                themed={themed}
                theme={theme}
                icon={<Smartphone size={16} color="#FFD8FA" />}
                placeholder="Device name"
                value={deviceName}
                onChangeText={setDeviceName}
              />
            </View>

            <View style={themed($fieldGroup)}>
              <Text style={themed($label)}>Recovery key</Text>
              <IconTextInput
                themed={themed}
                theme={theme}
                icon={<KeyRound size={16} color="#FFD8FA" />}
                placeholder="RK1-...."
                value={formatRecoveryKey(recoveryKey)}
                onChangeText={setRecoveryKey}
                multiline
                inputStyle={themed($recoveryInput)}
              />
            </View>
          </View>

          <GradientPrimaryButton
            themed={themed}
            label={busy ? "Recovering..." : "Use Recovery Key"}
            onPress={() => void handleRecover()}
            disabled={busy}
          />
        </GlassSection>

        {error ? (
          <VaultBanner themed={themed} tone="error" text={error} />
        ) : null}
        {status ? (
          <VaultBanner themed={themed} tone="status" text={status} />
        ) : null}

        <GhostButton
          themed={themed}
          label="Back"
          onPress={() => navigation.goBack()}
        />
      </ScrollView>
    </Screen>
  );
};

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 1,
  paddingHorizontal: spacing.lg,
});

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
  paddingTop: spacing.lg,
  paddingBottom: spacing.xl,
});

const $fieldStack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $fieldGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
});

const $label: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,236,255,0.74)",
  fontSize: 12,
  fontWeight: "600",
});

const $recoveryInput: ThemedStyle<TextStyle> = () => ({
  minHeight: 128,
  paddingTop: 2,
  letterSpacing: 1,
});

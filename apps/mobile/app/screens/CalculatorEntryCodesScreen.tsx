import { FC, useMemo, useState } from "react";
import { ScrollView, TextStyle, View, ViewStyle } from "react-native";
import { KeyRound, Shield } from "lucide-react-native";

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
  clearRealVaultEntryCode,
  DEFAULT_DECOY_ENTRY_CODE,
  hasCustomDecoyVaultEntryCode,
  hasRealVaultEntryCode,
  isValidStealthEntryCode,
  resetDecoyVaultEntryCode,
  setDecoyVaultEntryCode,
  setRealVaultEntryCode,
} from "@/locker/storage/stealthEntryRepo";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";

export const CalculatorEntryCodesScreen: FC<
  AppStackScreenProps<"CalculatorEntryCodes">
> = function CalculatorEntryCodesScreen(props) {
  const { navigation } = props;
  const { themed, theme } = useAppTheme();
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

  const [vaultEntryCode, setVaultEntryCodeInput] = useState("");
  const [decoyEntryCode, setDecoyEntryCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [realConfigured, setRealConfigured] = useState(() =>
    hasRealVaultEntryCode(),
  );
  const [customDecoyConfigured, setCustomDecoyConfigured] = useState(() =>
    hasCustomDecoyVaultEntryCode(),
  );

  const decoySummary = useMemo(() => {
    return customDecoyConfigured
      ? "Custom decoy code active."
      : `Default decoy code active: ${DEFAULT_DECOY_ENTRY_CODE}.`;
  }, [customDecoyConfigured]);

  const validateCode = (code: string, label: string): string | null => {
    if (!isValidStealthEntryCode(code)) {
      return `${label} must be 4 to 8 digits`;
    }
    return null;
  };

  const handleSaveVaultCode = () => {
    setError(null);
    setStatus(null);
    const trimmed = vaultEntryCode.trim();
    const validationError = validateCode(trimmed, "Vault Entry Code");
    if (validationError) {
      setError(validationError);
      return;
    }

    setRealVaultEntryCode(trimmed);
    setRealConfigured(true);
    setVaultEntryCodeInput("");
    setStatus("Vault Entry Code updated.");
  };

  const handleRemoveVaultCode = () => {
    setError(null);
    setStatus(null);
    clearRealVaultEntryCode();
    setRealConfigured(false);
    setVaultEntryCodeInput("");
    setStatus(
      "Vault Entry Code removed. Long-press '=' still opens the vault.",
    );
  };

  const handleSaveDecoyCode = () => {
    setError(null);
    setStatus(null);
    const trimmed = decoyEntryCode.trim();
    const validationError = validateCode(trimmed, "Decoy Entry Code");
    if (validationError) {
      setError(validationError);
      return;
    }

    setDecoyVaultEntryCode(trimmed);
    setCustomDecoyConfigured(true);
    setDecoyEntryCodeInput("");
    setStatus("Decoy Entry Code updated.");
  };

  const handleResetDecoyCode = () => {
    setError(null);
    setStatus(null);
    resetDecoyVaultEntryCode();
    setCustomDecoyConfigured(false);
    setDecoyEntryCodeInput("");
    setStatus(
      `Decoy Entry Code reset to the default ${DEFAULT_DECOY_ENTRY_CODE}.`,
    );
  };

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <VaultScreenBackground />
      <ScrollView
        contentContainerStyle={themed($content)}
        showsVerticalScrollIndicator={false}
      >
        <VaultScreenHero
          themed={themed}
          badge="ENTRY CODES"
          title="Calculator Entry Codes"
          subtitle="Shortcut codes open the vault from the calculator when entered exactly and followed by '='."
          icon={<KeyRound size={13} color="#FFD8FA" />}
          metaLabel="Stealth access"
          showBackButton
          onBackPress={() => navigation.goBack()}
        />

        <GlassSection
          themed={themed}
          title="Vault Entry Code"
          subtitle="This code opens the normal vault access path from the calculator."
          icon={<Shield size={14} color="#FFC8F3" />}
        >
          <Text style={themed($metaText)}>
            Status: {realConfigured ? "Configured" : "Not configured"}
          </Text>
          <Text style={themed($metaText)}>
            Exact digits only. These codes do not replace passkey protection and
            are not your vault encryption secret.
          </Text>
          <View style={themed($fieldGroup)}>
            <Text style={themed($label)}>New Vault Entry Code</Text>
            <IconTextInput
              themed={themed}
              theme={theme}
              icon={<KeyRound size={16} color="#FFD8FA" />}
              placeholder="4 to 8 digits"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              value={vaultEntryCode}
              onChangeText={setVaultEntryCodeInput}
            />
          </View>
          <GradientPrimaryButton
            themed={themed}
            label={
              realConfigured
                ? "Update Vault Entry Code"
                : "Set Vault Entry Code"
            }
            onPress={handleSaveVaultCode}
          />
          {realConfigured ? (
            <GhostButton
              themed={themed}
              label="Remove Vault Entry Code"
              onPress={handleRemoveVaultCode}
            />
          ) : null}
        </GlassSection>

        <GlassSection
          themed={themed}
          title="Decoy Entry Code"
          subtitle="This code opens the isolated decoy vault from the calculator."
          icon={<Shield size={14} color="#FFC8F3" />}
        >
          <Text style={themed($metaText)}>{decoySummary}</Text>
          <View style={themed($fieldGroup)}>
            <Text style={themed($label)}>New Decoy Entry Code</Text>
            <IconTextInput
              themed={themed}
              theme={theme}
              icon={<KeyRound size={16} color="#FFD8FA" />}
              placeholder="4 to 8 digits"
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              value={decoyEntryCode}
              onChangeText={setDecoyEntryCodeInput}
            />
          </View>
          <GradientPrimaryButton
            themed={themed}
            label="Update Decoy Entry Code"
            onPress={handleSaveDecoyCode}
          />
          {customDecoyConfigured ? (
            <GhostButton
              themed={themed}
              label="Reset Decoy Code to Default"
              onPress={handleResetDecoyCode}
            />
          ) : null}
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

const $fieldGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
});

const $label: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,236,255,0.74)",
  fontSize: 12,
  fontWeight: "600",
});

const $metaText: ThemedStyle<TextStyle> = () => ({
  color: "#F3E7F8",
  lineHeight: 20,
  fontSize: 13,
});

import { FC, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { KeyRound, ShieldAlert } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { GlassSection } from "@/components/vault-note/GlassSection";
import { GhostButton } from "@/components/vault-note/GhostButton";
import { GradientPrimaryButton } from "@/components/vault-note/GradientPrimaryButton";
import { MetaChip } from "@/components/vault-note/MetaChip";
import {
  VaultBanner,
  VaultGlassPanel,
  VaultScreenBackground,
  VaultScreenHero,
} from "@/components/vault-note/VaultScreenChrome";
import {
  createRecoveryArtifact,
  generateRecoveryKey,
} from "@/locker/recovery/recoveryKey";
import {
  getRecoveryEnvelopeStatus,
  upsertRecoveryEnvelope,
} from "@/locker/recovery/recoveryApi";
import { fetchAndInstallVaultKeyEnvelope } from "@/locker/keys/userKeyApi";
import { fetchJson } from "@/locker/net/apiClient";
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo";
import {
  getRemoteVaultId,
  getRemoteVaultName,
} from "@/locker/storage/remoteVaultRepo";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import { typography } from "@/theme/typography";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";
import type { VaultDTO } from "@locker/types";

type RecoveryStatus = {
  configured: boolean;
  rotatedAt?: string;
};

export const VaultRecoverySetupScreen: FC<
  AppStackScreenProps<"VaultRecoverySetup">
> = function VaultRecoverySetupScreen(props) {
  const { navigation } = props;
  const { themed } = useAppTheme();
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);
  const vaultId = getRemoteVaultId();
  const vaultName = getRemoteVaultName() ?? "Current vault";

  const [status, setStatus] = useState<RecoveryStatus>({ configured: false });
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!vaultId) {
      setError("No vault is selected on this device.");
      return;
    }
    try {
      const data = await getRecoveryEnvelopeStatus(vaultId);
      setStatus({
        configured: data.configured,
        rotatedAt: data.envelope?.rotatedAt,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load recovery status",
      );
    }
  }, [vaultId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    if (generatedKey) {
      setSaved(false);
    }
  }, [generatedKey]);

  const handleGenerate = useCallback(async () => {
    if (!vaultId) {
      setError("No vault is selected on this device.");
      return;
    }

    const run = async () => {
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const vaultKey = await getRemoteVaultKey(vaultId);
        if (!vaultKey) throw new Error("Vault key unavailable on this device.");
        const ownedVaults = (await fetchJson<{ vaults: VaultDTO[] }>("/v1/vaults")).vaults ?? [];
        const currentVault = ownedVaults.find((vault) => vault.id === vaultId) ?? null;
        const personalVault =
          ownedVaults.find((vault) => vault.name === "Personal") ?? null;

        const recovery = generateRecoveryKey();
        const envelopes = [{ vaultId, vaultKey, role: "target" as const }];
        if (currentVault && currentVault.name !== "Personal") {
          if (!personalVault) {
            throw new Error("Recovery setup could not include Personal vault. Try again from a device with Personal access.");
          }
          let personalVaultKey = await getRemoteVaultKey(personalVault.id);
          if (!personalVaultKey) {
            personalVaultKey = await fetchAndInstallVaultKeyEnvelope(personalVault.id);
          }
          if (!personalVaultKey) {
            throw new Error("Personal vault key unavailable on this device.");
          }
          envelopes.push({
            vaultId: personalVault.id,
            vaultKey: personalVaultKey,
            role: "personal" as const,
          });
        }
        const envelope = createRecoveryArtifact(envelopes, recovery.canonicalKey);
        await upsertRecoveryEnvelope(vaultId, envelope);
        setGeneratedKey(recovery.displayKey);
        setStatus({ configured: true, rotatedAt: new Date().toISOString() });
        setMessage(
          status.configured
            ? "Recovery key rotated. Previous key no longer works."
            : "Recovery key created.",
        );
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create recovery key",
        );
      } finally {
        setBusy(false);
      }
    };

    if (status.configured) {
      Alert.alert(
        "Regenerate recovery key?",
        "Generating a new recovery key will invalidate the previous one immediately.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Regenerate",
            style: "destructive",
            onPress: () => void run(),
          },
        ],
      );
      return;
    }

    await run();
  }, [status.configured, vaultId]);

  const handleDismiss = useCallback(() => {
    setGeneratedKey(null);
    setSaved(false);
    navigation.goBack();
  }, [navigation]);

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
          title="Recovery Key"
          subtitle={`Create a one-time recovery key for ${vaultName}. It wraps this vault’s key without exposing the vault key itself.`}
          icon={<ShieldAlert size={13} color="#FFD8FA" />}
          metaLabel={status.configured ? "Configured" : "Not configured"}
        />

        <GlassSection
          themed={themed}
          title="Status"
          subtitle="Generate or rotate the one-time recovery secret for this vault."
          icon={<KeyRound size={14} color="#FFC8F3" />}
          rightSlot={
            <MetaChip
              themed={themed}
              label={
                status.rotatedAt
                  ? `Updated ${new Date(status.rotatedAt).toLocaleDateString()}`
                  : "Awaiting setup"
              }
            />
          }
        >
          <Text style={themed($bodyText)}>
            {status.configured
              ? `Configured${status.rotatedAt ? ` on ${new Date(status.rotatedAt).toLocaleString()}` : ""}.`
              : "No recovery key is configured for this vault."}
          </Text>
          <GradientPrimaryButton
            themed={themed}
            label={
              busy
                ? "Working..."
                : status.configured
                  ? "Regenerate Recovery Key"
                  : "Generate Recovery Key"
            }
            onPress={() => void handleGenerate()}
            disabled={busy}
          />
        </GlassSection>

        {generatedKey ? (
          <GlassSection
            themed={themed}
            title="Save This Now"
            subtitle="Locker shows this key once. Save it before leaving this screen."
            icon={<ShieldAlert size={14} color="#FFC8F3" />}
          >
            <Text style={themed($warningText)}>
              Locker will show this recovery key only once. If you dismiss this
              screen without saving it, you must generate a new one.
            </Text>
            <VaultGlassPanel themed={themed}>
              <Text selectable style={themed($keyText)}>
                {generatedKey}
              </Text>
            </VaultGlassPanel>

            <Pressable
              style={themed($checkboxRow)}
              onPress={() => setSaved((current) => !current)}
            >
              <View style={themed([$checkbox, saved && $checkboxChecked])} />
              <Text style={themed($bodyText)}>I saved this recovery key.</Text>
            </Pressable>

            <GradientPrimaryButton
              themed={themed}
              label="I Saved This"
              onPress={handleDismiss}
              disabled={!saved}
            />
          </GlassSection>
        ) : null}

        {error ? (
          <VaultBanner themed={themed} tone="error" text={error} />
        ) : null}
        {message ? (
          <VaultBanner themed={themed} tone="status" text={message} />
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

const $bodyText: ThemedStyle<TextStyle> = () => ({
  color: "#F3E7F8",
  lineHeight: 20,
  fontSize: 13,
});

const $warningText: ThemedStyle<TextStyle> = () => ({
  color: "#FFD3F2",
  lineHeight: 20,
  fontSize: 13,
});

const $keyText: ThemedStyle<TextStyle> = () => ({
  color: "#FFF6FF",
  letterSpacing: 1.2,
  lineHeight: 24,
  fontFamily: typography.primary.semiBold,
});

const $checkboxRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingTop: spacing.xs,
});

const $checkbox: ThemedStyle<ViewStyle> = () => ({
  width: 22,
  height: 22,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.24)",
  backgroundColor: "rgba(255,255,255,0.03)",
});

const $checkboxChecked: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.primary300,
  borderColor: colors.palette.primary300,
});

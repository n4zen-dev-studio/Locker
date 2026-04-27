import { FC, useCallback, useEffect, useState } from "react";
import { ScrollView, TextStyle, View, ViewStyle } from "react-native";
import { Link2, QrCode, Shield } from "lucide-react-native";

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
import { getToken } from "@/locker/auth/tokenStore";
import { parseLockerQrPayload } from "@/locker/linking/qrPayload";
import {
  formatPairingCode,
  isValidPairingCode,
  normalizePairingCode,
  unwrapVaultKeyPayload,
} from "@/locker/pairing/pairingCode";
import { fetchJson } from "@/locker/net/apiClient";
import { setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo";
import { getAccount } from "@/locker/storage/accountRepo";
import {
  setRemoteVaultId,
  setVaultEnabledOnDevice,
} from "@/locker/storage/remoteVaultRepo";
import { requestSync } from "@/locker/sync/syncCoordinator";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import { typography } from "@/theme/typography";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";

export const VaultImportPairingScreen: FC<
  AppStackScreenProps<"VaultImportPairing">
> = function VaultImportPairingScreen(props) {
  const { navigation, route } = props;
  const { themed, theme } = useAppTheme();
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);
  const expectedVaultId = route.params?.vaultId;
  const expectedVaultName = route.params?.vaultName;
  const initialPayload = route.params?.initialPayload ?? "";

  const [pairingCode, setPairingCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLinked, setIsLinked] = useState(false);

  useEffect(() => {
    if (initialPayload) {
      setPairingCode(initialPayload);
    }
  }, [initialPayload]);

  const refreshLinked = useCallback(async () => {
    try {
      const token = await getToken();
      setIsLinked(!!token);
    } catch {
      setIsLinked(false);
    }
  }, []);

  useEffect(() => {
    void refreshLinked();
  }, [refreshLinked]);

  const handleGoLink = useCallback(() => {
    navigation.navigate("VaultLinkDevice");
  }, [navigation]);

  const handleImport = async () => {
    setError(null);
    setStatus(null);

    const qrPayload = parseLockerQrPayload(pairingCode);
    const rawCode =
      qrPayload?.t === "locker-vault-access"
        ? qrPayload.pairingCode
        : pairingCode;
    const normalizedCode = normalizePairingCode(rawCode);
    if (!normalizedCode) {
      setError("Enter a pairing code");
      return;
    }
    if (!isValidPairingCode(normalizedCode)) {
      setError("Enter the 8-character pairing code");
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        setIsLinked(false);
        setError(
          "Device not linked. Tap “Link device” below, then retry import.",
        );
        return;
      }

      const data = await fetchJson<{
        vaultId: string;
        wrappedVaultKeyB64: string;
      }>(
        "/v1/pairing-codes/redeem",
        {
          method: "POST",
          body: JSON.stringify({ pairingCode: normalizedCode }),
        },
        { token },
      );

      const unwrapped = unwrapVaultKeyPayload({
        pairingCode: normalizedCode,
        wrappedVaultKeyB64: data.wrappedVaultKeyB64,
      });
      if (expectedVaultId && unwrapped.vaultId !== expectedVaultId) {
        throw new Error(
          `This access code is for a different vault${expectedVaultName ? ` than ${expectedVaultName}` : ""}.`,
        );
      }

      await setRemoteVaultKey(unwrapped.vaultId, unwrapped.rvk);
      const account = getAccount();
      if (account?.device.id) {
        await fetchJson(
          `/v1/devices/${account.device.id}/vaults/${unwrapped.vaultId}`,
          { method: "PUT" },
        );
      }
      setRemoteVaultId(unwrapped.vaultId, expectedVaultName);
      setVaultEnabledOnDevice(unwrapped.vaultId, true, {
        name: expectedVaultName,
      });
      void requestSync("vault_enabled", unwrapped.vaultId);
      setStatus("Vault added to this device. Sync is ready.");
      navigation.replace("RemoteVault");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
    }
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
          badge="VAULT ACCESS"
          title={
            expectedVaultName
              ? `Add ${expectedVaultName}`
              : "Enter Vault Access Code"
          }
          subtitle="Use the one-time vault access code from another one of your devices."
          icon={<Shield size={13} color="#FFD8FA" />}
          metaLabel={isLinked ? "Linked device" : "Link required"}
          showBackButton
          onBackPress={() => navigation.goBack()}
        />

        {!isLinked ? (
          <GlassSection
            themed={themed}
            title="Link Required"
            subtitle="This device must be linked before vault pairing import can complete."
            icon={<Link2 size={14} color="#FFC8F3" />}
          >
            <Text style={themed($bodyText)}>
              This device isn’t linked yet. Link it first to enable pairing
              import.
            </Text>
            <GhostButton
              themed={themed}
              label="Link device"
              onPress={handleGoLink}
            />
          </GlassSection>
        ) : null}

        <GlassSection
          themed={themed}
          title="Pairing Code"
          subtitle="Paste the code or scan the QR from another linked device."
          icon={<QrCode size={14} color="#FFC8F3" />}
        >
          <View style={themed($fieldGroup)}>
            <Text style={themed($label)}>One-time vault access code</Text>
            <IconTextInput
              themed={themed}
              theme={theme}
              icon={<Shield size={16} color="#FFD8FA" />}
              placeholder="ABCD-EFGH"
              value={formatPairingCode(pairingCode)}
              onChangeText={setPairingCode}
              inputStyle={themed($pairingInput)}
            />
          </View>

          <GhostButton
            themed={themed}
            label="Scan QR Instead"
            icon={<QrCode size={15} color="#F9E7FF" />}
            onPress={() =>
              navigation.navigate("VaultQrScanner", {
                mode: "vault-access",
                vaultId: expectedVaultId,
                vaultName: expectedVaultName,
              })
            }
          />

          <GradientPrimaryButton
            themed={themed}
            label="Add Vault to This Device"
            onPress={() => void handleImport()}
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

const $fieldGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
});

const $label: ThemedStyle<TextStyle> = () => ({
  color: "rgba(255,236,255,0.74)",
  fontSize: 12,
  fontWeight: "600",
});

const $bodyText: ThemedStyle<TextStyle> = () => ({
  color: "#F3E7F8",
  lineHeight: 20,
  fontSize: 13,
});

const $pairingInput: ThemedStyle<TextStyle> = () => ({
  fontFamily: typography.primary.semiBold,
  letterSpacing: 2.4,
});

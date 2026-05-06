import { FC, useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, TextStyle, View, ViewStyle } from "react-native";
import { QrCode, Smartphone } from "lucide-react-native";
import { SvgXml } from "react-native-svg";
import QRCode from "qrcode";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { GhostButton } from "@/components/vault-note/GhostButton";
import { GlassSection } from "@/components/vault-note/GlassSection";
import { MetaChip } from "@/components/vault-note/MetaChip";
import {
  VaultBanner,
  VaultGlassPanel,
  VaultScreenBackground,
  VaultScreenHero,
} from "@/components/vault-note/VaultScreenChrome";
import { DEFAULT_API_BASE_URL } from "@/locker/config";
import { fetchJson } from "@/locker/net/apiClient";
import {
  buildProvisioningPayload,
  formatDeviceLinkCode,
  generateDeviceLinkCode,
} from "@/locker/linking/deviceLinkPayload";
import { encodeDeviceLinkQrPayload } from "@/locker/linking/qrPayload";
import { getRemoteVaultKey } from "@/locker/storage/remoteKeyRepo";
import { listRemoteVaults } from "@/locker/storage/remoteVaultRepo";
import { getServerUrl } from "@/locker/storage/serverConfigRepo";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import { typography } from "@/theme/typography";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";

const PERSONAL_VAULT_NAME = "Personal";

export const VaultPairDeviceScreen: FC<AppStackScreenProps<"VaultPairDevice">> =
  function VaultPairDeviceScreen(props) {
    const { navigation } = props;
    const { themed } = useAppTheme();
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

    const [linkCode, setLinkCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [qrXml, setQrXml] = useState<string | null>(null);

    const formattedCode = useMemo(
      () => formatDeviceLinkCode(linkCode),
      [linkCode],
    );
    const qrPayload = useMemo(
      () =>
        linkCode
          ? encodeDeviceLinkQrPayload({
              apiBase: getServerUrl() || DEFAULT_API_BASE_URL,
              linkCode,
            })
          : null,
      [linkCode],
    );

    useEffect(() => {
      let cancelled = false;
      if (!qrPayload) {
        setQrXml(null);
        return;
      }
      QRCode.toString(qrPayload, { type: "svg", margin: 1, width: 220 })
        .then((xml) => {
          if (!cancelled) setQrXml(xml);
        })
        .catch(() => {
          if (!cancelled) setQrXml(null);
        });
      return () => {
        cancelled = true;
      };
    }, [qrPayload]);

    const buildCode = useCallback(async () => {
      setError(null);
      setStatus(null);
      const personalVault = listRemoteVaults().find(
        (vault) => vault.name === PERSONAL_VAULT_NAME,
      );
      if (!personalVault) {
        setError("Personal vault is not available on this device yet.");
        return;
      }
      const rvk = await getRemoteVaultKey(personalVault.id);
      if (!rvk) {
        setError("Personal vault key is missing on this device.");
        return;
      }

      try {
        const nextCode = generateDeviceLinkCode();
        const provisioningPayload = buildProvisioningPayload({
          linkCode: nextCode,
          vaults: [
            { vaultId: personalVault.id, name: personalVault.name, rvk },
          ],
        });
        const data = await fetchJson<{ linkCode: string; expiresAt: string }>(
          "/v1/devices/link-code",
          {
            method: "POST",
            body: JSON.stringify({ linkCode: nextCode, provisioningPayload }),
          },
        );
        setLinkCode(data.linkCode);
        setExpiresAt(data.expiresAt);
        setStatus(
          "Device setup code ready. Personal will be provisioned automatically on the new device.",
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to create device setup code",
        );
      }
    }, []);

    useEffect(() => {
      void buildCode();
    }, [buildCode]);

    return (
      <Screen
        preset="scroll"
        contentContainerStyle={themed([$screen, $insets])}
      >
        <VaultScreenBackground />
        <ScrollView
          contentContainerStyle={themed($content)}
          showsVerticalScrollIndicator={false}
        >
          <VaultScreenHero
            themed={themed}
            badge="PAIR DEVICE"
            title="Add Another Device"
            subtitle="Generate a one-time setup code for another one of your devices."
            icon={<Smartphone size={13} color="#FFD8FA" />}
            metaLabel={expiresAt ? "Live code" : "Preparing"}
            showBackButton
            onBackPress={() => navigation.goBack()}
          />

          <GlassSection
            themed={themed}
            title="Setup Code"
            subtitle="Use this one-time code on the new device or scan the QR below."
            icon={<QrCode size={14} color="#FFC8F3" />}
            rightSlot={
              expiresAt ? (
                <MetaChip
                  themed={themed}
                  label={`Expires ${new Date(expiresAt).toLocaleTimeString()}`}
                />
              ) : null
            }
          >
            <VaultGlassPanel themed={themed}>
              <Text style={themed($codeText)}>
                {formattedCode || "---- ---- ----"}
              </Text>
              <Text style={themed($bodyText)}>
                On the new device, choose “I already use Locker”, enter this
                code, and Personal will be enabled automatically.
              </Text>
            </VaultGlassPanel>

            {qrXml ? (
              <View style={themed($qrWrap)}>
                <SvgXml xml={qrXml} width={220} height={220} />
              </View>
            ) : null}

            <Text style={themed($bodyText)}>
              Or scan the QR code from the new device.
            </Text>
          </GlassSection>

          {error ? (
            <VaultBanner themed={themed} tone="error" text={error} />
          ) : null}
          {status ? (
            <VaultBanner themed={themed} tone="status" text={status} />
          ) : null}

          <GhostButton
            themed={themed}
            label="Generate New Code"
            onPress={() => void buildCode()}
          />
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

const $codeText: ThemedStyle<TextStyle> = () => ({
  color: "#FFF6FF",
  fontFamily: typography.primary.bold,
  fontSize: 28,
  lineHeight: 34,
  letterSpacing: 4,
  textAlign: "center",
});

const $bodyText: ThemedStyle<TextStyle> = () => ({
  color: "#F3E7F8",
  textAlign: "center",
  lineHeight: 20,
  fontSize: 13,
});

const $qrWrap: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
  paddingVertical: 4,
});

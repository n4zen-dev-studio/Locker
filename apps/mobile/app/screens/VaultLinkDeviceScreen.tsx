import { FC, useCallback, useEffect, useState } from "react";
import { Platform, ScrollView, TextStyle, View, ViewStyle } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { QrCode, Smartphone, Unplug } from "lucide-react-native";

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
import { DEFAULT_API_BASE_URL } from "@/locker/config";
import { setToken } from "@/locker/auth/tokenStore";
import { ensureBootstrapState } from "@/locker/bootstrap/bootstrapRepo";
import { completeVaultSelectionFlow } from "@/locker/storage/onboardingRepo";
import { fetchJson, normalizeApiBaseUrl } from "@/locker/net/apiClient";
import { parseLockerQrPayload } from "@/locker/linking/qrPayload";
import {
  unwrapProvisioningPayload,
  formatDeviceLinkCode,
  normalizeDeviceLinkCode,
} from "@/locker/linking/deviceLinkPayload";
import { vaultSession } from "@/locker/session";
import { setRemoteVaultKey } from "@/locker/storage/remoteKeyRepo";
import { getServerUrl, setServerUrl } from "@/locker/storage/serverConfigRepo";
import { AccountState, setAccount } from "@/locker/storage/accountRepo";
import {
  setRemoteVaultId,
  setVaultEnabledOnDevice,
} from "@/locker/storage/remoteVaultRepo";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";
import { DeviceDTO, UserDTO } from "@locker/types";

type LinkPayload = {
  t?: string;
  apiBase?: string;
  linkCode?: string;
};

export const VaultLinkDeviceScreen: FC<AppStackScreenProps<"VaultLinkDevice">> =
  function VaultLinkDeviceScreen(props) {
    const { navigation } = props;
    const initialPayload = props.route.params?.initialPayload ?? "";
    const { themed, theme } = useAppTheme();
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);

    const [payload, setPayload] = useState("");
    const [deviceName, setDeviceName] = useState(
      Platform.OS === "ios" ? "Locker iPhone" : "Locker Android",
    );
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);

    useEffect(() => {
      if (initialPayload) {
        setPayload(initialPayload);
      }
    }, [initialPayload]);

    useFocusEffect(
      useCallback(() => {
        if (!vaultSession.isUnlocked()) {
          navigation.replace("VaultLocked");
        }
      }, [navigation]),
    );

    const handleRedeem = async () => {
      setError(null);
      setStatus(null);
      const trimmed = payload.trim();
      if (!trimmed) {
        setError("Paste your one-time device code");
        return;
      }

      let linkCode = "";
      let apiBase = getServerUrl() || DEFAULT_API_BASE_URL;

      if (trimmed.startsWith("{")) {
        const qrPayload = parseLockerQrPayload(trimmed);
        if (qrPayload?.t === "locker-device-link") {
          linkCode = qrPayload.linkCode;
          if (qrPayload.apiBase) apiBase = qrPayload.apiBase;
        } else {
          try {
            const parsed = JSON.parse(trimmed) as LinkPayload;
            if (parsed.linkCode) linkCode = parsed.linkCode;
            if (parsed.apiBase) apiBase = parsed.apiBase;
          } catch {
            setError("Invalid device code");
            return;
          }
        }
      } else {
        linkCode = normalizeDeviceLinkCode(trimmed);
      }

      if (!linkCode) {
        setError("Missing device code");
        return;
      }

      try {
        setStatus("Linking this device...");
        apiBase = normalizeApiBaseUrl(apiBase);
        const bootstrap = ensureBootstrapState();
        const data = await fetchJson<{
          token: string;
          user: UserDTO;
          device: DeviceDTO;
          provisioningPayload?: string | null;
        }>(
          "/v1/devices/link-code/redeem",
          {
            method: "POST",
            body: JSON.stringify({
              linkCode,
              deviceId: bootstrap.deviceId,
              deviceName: deviceName.trim() || "Locker Mobile",
              platform: Platform.OS === "ios" ? "ios" : "android",
            }),
          },
          { baseUrl: apiBase, auth: "none" },
        );

        await setToken(data.token);
        setServerUrl(apiBase);

        const account: AccountState = {
          user: data.user,
          device: data.device,
          apiBase,
          linkedAt: new Date().toISOString(),
        };
        setAccount(account);

        const me = await fetchJson<{ user: UserDTO }>(
          "/v1/me",
          {},
          { baseUrl: apiBase, token: data.token },
        );
        setAccount({ ...account, user: me.user });
        if (data.provisioningPayload) {
          const provisionedVaults = unwrapProvisioningPayload({
            linkCode,
            provisioningPayload: data.provisioningPayload,
          });
          for (const vault of provisionedVaults) {
            await setRemoteVaultKey(vault.vaultId, vault.rvk);
            setVaultEnabledOnDevice(vault.vaultId, true, { name: vault.name });
          }
          const personal =
            provisionedVaults.find((vault) => vault.name === "Personal") ??
            provisionedVaults[0];
          if (personal) setRemoteVaultId(personal.vaultId, personal.name);
        }
        completeVaultSelectionFlow();
        setStatus(
          "Device linked. Choose which vaults belong on this device next.",
        );
        (navigation.replace as (...args: unknown[]) => void)("VaultTabs");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Link failed";
        setError(message);
      }
    };

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
            badge="DEVICE LINK"
            title="Set Up This Device"
            subtitle="Add this phone to your existing Locker account."
            icon={<Unplug size={13} color="#FFD8FA" />}
            metaLabel={status ? "Linking" : "Awaiting code"}
          />

          <GlassSection
            themed={themed}
            title="Add This Device"
            subtitle="Use the one-time setup code from one of your already linked devices."
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
                <Text style={themed($label)}>One-time device code</Text>
                <IconTextInput
                  themed={themed}
                  theme={theme}
                  icon={<Unplug size={16} color="#FFD8FA" />}
                  placeholder="Paste the code from one of your linked devices"
                  value={formatDeviceLinkCode(payload)}
                  onChangeText={setPayload}
                  multiline
                  inputStyle={themed($payloadInput)}
                />
              </View>
            </View>

            <GhostButton
              themed={themed}
              label="Scan QR Instead"
              icon={<QrCode size={15} color="#F9E7FF" />}
              onPress={() =>
                navigation.navigate("VaultQrScanner", { mode: "device-link" })
              }
            />

            <GradientPrimaryButton
              themed={themed}
              label="Add My Device"
              onPress={handleRedeem}
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

const $payloadInput: ThemedStyle<TextStyle> = () => ({
  minHeight: 128,
  paddingTop: 2,
  letterSpacing: 1.2,
});

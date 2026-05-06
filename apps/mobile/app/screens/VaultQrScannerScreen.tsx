import { FC, useCallback, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, QrCode } from "lucide-react-native";

import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { GhostButton } from "@/components/vault-note/GhostButton";
import { GlassSection } from "@/components/vault-note/GlassSection";
import { GradientPrimaryButton } from "@/components/vault-note/GradientPrimaryButton";
import {
  VaultBanner,
  VaultScreenBackground,
  VaultScreenHero,
} from "@/components/vault-note/VaultScreenChrome";
import { parseLockerQrPayload } from "@/locker/linking/qrPayload";
import type { AppStackScreenProps } from "@/navigators/navigationTypes";
import { useAppTheme } from "@/theme/context";
import type { ThemedStyle } from "@/theme/types";
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle";

export const VaultQrScannerScreen: FC<AppStackScreenProps<"VaultQrScanner">> =
  function VaultQrScannerScreen(props) {
    const { navigation, route } = props;
    const { themed } = useAppTheme();
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"]);
    const [permission, requestPermission] = useCameraPermissions();
    const [error, setError] = useState<string | null>(null);
    const [handled, setHandled] = useState(false);

    const mode = route.params?.mode ?? "device-link";
    const title = useMemo(
      () => (mode === "device-link" ? "Scan Device-Link QR" : "Scan Vault QR"),
      [mode],
    );

    const handleBarcode = useCallback(
      ({ data }: { data: string }) => {
        if (handled) return;
        const parsed = parseLockerQrPayload(data);
        if (!parsed) {
          setError("That QR code is not a Locker setup code.");
          return;
        }

        if (mode === "device-link" && parsed.t !== "locker-device-link") {
          setError("This QR code is for vault access, not device linking.");
          return;
        }
        if (mode === "vault-access" && parsed.t !== "locker-vault-access") {
          setError("This QR code is for device linking, not vault access.");
          return;
        }

        setHandled(true);
        if (parsed.t === "locker-device-link") {
          navigation.replace("VaultLinkDevice", {
            initialPayload: parsed.linkCode,
          });
          return;
        }
        navigation.replace("VaultImportPairing", {
          vaultId: route.params?.vaultId ?? parsed.vaultId,
          vaultName: route.params?.vaultName ?? parsed.vaultName ?? undefined,
          initialPayload: parsed.pairingCode,
        });
      },
      [
        handled,
        mode,
        navigation,
        route.params?.vaultId,
        route.params?.vaultName,
      ],
    );

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
            badge="QR SCANNER"
            title={title}
            subtitle="Scan the one-time QR from another one of your linked devices."
            icon={<QrCode size={13} color="#FFD8FA" />}
            metaLabel={
              permission?.granted ? "Camera ready" : "Permission needed"
            }
            showBackButton
            onBackPress={() => navigation.goBack()}
          />

          <GlassSection
            themed={themed}
            title="Scanner"
            subtitle="Point the camera at the Locker QR and keep it inside the frame."
            icon={<Camera size={14} color="#FFC8F3" />}
          >
            {!permission?.granted ? (
              <View style={themed($permissionState)}>
                <Text style={themed($bodyText)}>
                  Camera access is required to scan Locker QR codes.
                </Text>
                <GradientPrimaryButton
                  themed={themed}
                  label="Allow Camera"
                  onPress={() => void requestPermission()}
                />
              </View>
            ) : (
              <View style={themed($cameraShell)}>
                <CameraView
                  style={themed($camera)}
                  facing="back"
                  onBarcodeScanned={handleBarcode}
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                />
                <View pointerEvents="none" style={themed($scanFrameWrap)}>
                  <View style={themed($scanFrame)} />
                </View>
              </View>
            )}
          </GlassSection>

          {error ? (
            <VaultBanner themed={themed} tone="error" text={error} />
          ) : null}

          <GhostButton
            themed={themed}
            label="Cancel"
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

const $permissionState: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.md,
});

const $cameraShell: ThemedStyle<ViewStyle> = () => ({
  position: "relative",
  overflow: "hidden",
  borderRadius: 24,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  backgroundColor: "rgba(6,7,12,0.58)",
  minHeight: 420,
});

const $camera: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 420,
});

const $scanFrameWrap: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFillObject,
  alignItems: "center",
  justifyContent: "center",
});

const $scanFrame: ThemedStyle<ViewStyle> = () => ({
  width: 220,
  height: 220,
  borderRadius: 28,
  borderWidth: 2,
  borderColor: "rgba(255,216,250,0.95)",
  backgroundColor: "rgba(255,255,255,0.03)",
});

const $bodyText: ThemedStyle<TextStyle> = () => ({
  color: "#F3E7F8",
  lineHeight: 20,
  fontSize: 13,
});

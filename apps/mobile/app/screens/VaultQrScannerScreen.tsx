import { FC, useCallback, useMemo, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { parseLockerQrPayload } from "@/locker/linking/qrPayload"
import { vaultSession } from "@/locker/session"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultQrScannerScreen: FC<AppStackScreenProps<"VaultQrScanner">> = function VaultQrScannerScreen(props) {
  const { navigation, route } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])
  const [permission, requestPermission] = useCameraPermissions()
  const [error, setError] = useState<string | null>(null)
  const [handled, setHandled] = useState(false)

  const mode = route.params?.mode ?? "device-link"
  const title = useMemo(
    () => (mode === "device-link" ? "Scan Device-Link QR" : "Scan Vault QR"),
    [mode],
  )

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
      }
    }, [navigation]),
  )

  const handleBarcode = useCallback(
    ({ data }: { data: string }) => {
      if (handled) return
      const parsed = parseLockerQrPayload(data)
      if (!parsed) {
        setError("That QR code is not a Locker setup code.")
        return
      }

      if (mode === "device-link" && parsed.t !== "locker-device-link") {
        setError("This QR code is for vault access, not device linking.")
        return
      }
      if (mode === "vault-access" && parsed.t !== "locker-vault-access") {
        setError("This QR code is for device linking, not vault access.")
        return
      }

      setHandled(true)
      if (parsed.t === "locker-device-link") {
        navigation.replace("VaultLinkDevice", { initialPayload: parsed.linkCode })
        return
      }
      navigation.replace("VaultImportPairing", {
        vaultId: route.params?.vaultId ?? parsed.vaultId,
        vaultName: route.params?.vaultName ?? parsed.vaultName ?? undefined,
        initialPayload: parsed.pairingCode,
      })
    },
    [handled, mode, navigation, route.params?.vaultId, route.params?.vaultName],
  )

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          {title}
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Scan the one-time QR from another one of your linked devices.
        </Text>
      </View>

      {!permission?.granted ? (
        <View style={themed($card)}>
          <Text style={themed($bodyText)}>Camera access is required to scan Locker QR codes.</Text>
          <Pressable style={themed($primaryButton)} onPress={() => void requestPermission()}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              Allow Camera
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={themed($cameraWrap)}>
          <CameraView
            style={themed($camera)}
            facing="back"
            onBarcodeScanned={handleBarcode}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          />
        </View>
      )}

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}

      <Pressable style={themed($secondaryButton)} onPress={() => navigation.goBack()}>
        <Text preset="bold" style={themed($secondaryButtonText)}>
          Cancel
        </Text>
      </Pressable>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.palette.neutral900,
  paddingHorizontal: spacing.xl,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.xl,
  marginBottom: spacing.lg,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

const $cameraWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  overflow: "hidden",
  borderRadius: 24,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.15)",
  marginBottom: spacing.md,
})

const $camera: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: 18,
  padding: spacing.md,
  backgroundColor: "rgba(255,255,255,0.06)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  gap: spacing.sm,
  marginBottom: spacing.md,
})

const $bodyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255,255,255,0.08)",
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
  marginBottom: spacing.lg,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.angry500,
  marginBottom: spacing.md,
})

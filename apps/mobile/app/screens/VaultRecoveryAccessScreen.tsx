import { FC, useCallback, useState } from "react"
import { Platform, Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { fetchPublicRecoveryEnvelope, redeemRecoveryEnvelope } from "@/locker/recovery/recoveryApi"
import { createRecoveryProof, formatRecoveryKey, openRecoveryEnvelope, parseRecoveryKey } from "@/locker/recovery/recoveryKey"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultRecoveryAccessScreen: FC<AppStackScreenProps<"VaultRecoveryAccess">> =
  function VaultRecoveryAccessScreen(props) {
    const { navigation } = props
    const { themed } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

    const [recoveryKey, setRecoveryKey] = useState("")
    const [deviceName, setDeviceName] = useState(Platform.OS === "ios" ? "Locker iPhone" : "Locker Android")
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const handleRecover = useCallback(async () => {
      setError(null)
      setStatus(null)

      let parsed
      try {
        parsed = parseRecoveryKey(recoveryKey)
      } catch {
        setError("Enter a valid recovery key.")
        return
      }

      setBusy(true)
      try {
        setStatus("Validating recovery key...")
        const envelope = await fetchPublicRecoveryEnvelope(parsed.recoveryId)
        const vaultKey = openRecoveryEnvelope(envelope, parsed.canonicalKey)
        if (vaultKey.length !== 32) throw new Error("RECOVERY_FAILED")
        const proofB64 = createRecoveryProof(parsed.canonicalKey, envelope)
        setStatus("Linking this device...")
        await redeemRecoveryEnvelope({
          proofB64,
          vaultKey,
          envelope,
          deviceName,
        })
        navigation.replace("VaultTabs")
      } catch {
        setError("Recovery failed. Check the key and try again.")
      } finally {
        setBusy(false)
      }
    }, [deviceName, navigation, recoveryKey])

    return (
      <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
        <View style={themed($header)}>
          <Text preset="heading" style={themed($title)}>
            Use Recovery Key
          </Text>
          <Text preset="subheading" style={themed($subtitle)}>
            Recover vault access on this device and continue through the normal device-link flow.
          </Text>
        </View>

        <Text style={themed($label)}>Device name</Text>
        <TextInput
          value={deviceName}
          onChangeText={setDeviceName}
          placeholder="Device name"
          placeholderTextColor="#9aa0a6"
          style={themed($input)}
        />

        <Text style={themed($label)}>Recovery key</Text>
        <TextInput
          value={formatRecoveryKey(recoveryKey)}
          onChangeText={setRecoveryKey}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="RK1-...."
          placeholderTextColor="#9aa0a6"
          style={themed([$input, $payloadInput])}
          multiline
        />

        {error ? <Text style={themed($errorText)}>{error}</Text> : null}
        {status ? <Text style={themed($statusText)}>{status}</Text> : null}

        <Pressable style={themed($primaryButton)} onPress={() => void handleRecover()} disabled={busy}>
          <Text preset="bold" style={themed($primaryButtonText)}>
            {busy ? "Recovering..." : "Use Recovery Key"}
          </Text>
        </Pressable>

        <Pressable style={themed($linkButton)} onPress={() => navigation.goBack()}>
          <Text preset="bold" style={themed($linkText)}>
            Back
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

const $label: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral300,
  marginBottom: spacing.xs,
})

const $input: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 14,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  color: colors.palette.neutral100,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
  marginBottom: spacing.md,
})

const $payloadInput: ThemedStyle<TextStyle> = () => ({
  minHeight: 140,
  textAlignVertical: "top",
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.angry500,
  marginBottom: spacing.md,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.palette.neutral300,
  marginBottom: spacing.md,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginBottom: spacing.md,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

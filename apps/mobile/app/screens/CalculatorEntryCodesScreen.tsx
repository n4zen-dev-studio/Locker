import { FC, useMemo, useState } from "react"
import { Pressable, TextStyle, View, ViewStyle } from "react-native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import {
  clearRealVaultEntryCode,
  DEFAULT_DECOY_ENTRY_CODE,
  hasCustomDecoyVaultEntryCode,
  hasRealVaultEntryCode,
  isValidStealthEntryCode,
  resetDecoyVaultEntryCode,
  setDecoyVaultEntryCode,
  setRealVaultEntryCode,
} from "@/locker/storage/stealthEntryRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const CalculatorEntryCodesScreen: FC<AppStackScreenProps<"CalculatorEntryCodes">> =
  function CalculatorEntryCodesScreen(props) {
    const { navigation } = props
    const { themed } = useAppTheme()
    const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

    const [vaultEntryCode, setVaultEntryCodeInput] = useState("")
    const [decoyEntryCode, setDecoyEntryCodeInput] = useState("")
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<string | null>(null)
    const [realConfigured, setRealConfigured] = useState(() => hasRealVaultEntryCode())
    const [customDecoyConfigured, setCustomDecoyConfigured] = useState(() => hasCustomDecoyVaultEntryCode())

    const decoySummary = useMemo(() => {
      return customDecoyConfigured ? "Custom decoy code active." : `Default decoy code active: ${DEFAULT_DECOY_ENTRY_CODE}.`
    }, [customDecoyConfigured])

    const validateCode = (code: string, label: string): string | null => {
      if (!isValidStealthEntryCode(code)) {
        return `${label} must be 4 to 8 digits`
      }
      return null
    }

    const handleSaveVaultCode = () => {
      setError(null)
      setStatus(null)
      const trimmed = vaultEntryCode.trim()
      const validationError = validateCode(trimmed, "Vault Entry Code")
      if (validationError) {
        setError(validationError)
        return
      }

      setRealVaultEntryCode(trimmed)
      setRealConfigured(true)
      setVaultEntryCodeInput("")
      setStatus("Vault Entry Code updated.")
    }

    const handleRemoveVaultCode = () => {
      setError(null)
      setStatus(null)
      clearRealVaultEntryCode()
      setRealConfigured(false)
      setVaultEntryCodeInput("")
      setStatus("Vault Entry Code removed. Long-press '=' still opens the vault.")
    }

    const handleSaveDecoyCode = () => {
      setError(null)
      setStatus(null)
      const trimmed = decoyEntryCode.trim()
      const validationError = validateCode(trimmed, "Decoy Entry Code")
      if (validationError) {
        setError(validationError)
        return
      }

      setDecoyVaultEntryCode(trimmed)
      setCustomDecoyConfigured(true)
      setDecoyEntryCodeInput("")
      setStatus("Decoy Entry Code updated.")
    }

    const handleResetDecoyCode = () => {
      setError(null)
      setStatus(null)
      resetDecoyVaultEntryCode()
      setCustomDecoyConfigured(false)
      setDecoyEntryCodeInput("")
      setStatus(`Decoy Entry Code reset to the default ${DEFAULT_DECOY_ENTRY_CODE}.`)
    }

    return (
      <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
        <View style={themed($header)}>
          <Text preset="heading" style={themed($title)}>
            Calculator Entry Codes
          </Text>
          <Text preset="subheading" style={themed($subtitle)}>
            Shortcut codes open the vault from the calculator when entered exactly and followed by "=".
          </Text>
          <Text style={themed($metaText)}>
            These codes do not replace passkey protection and are not your vault encryption secret.
          </Text>
        </View>

        <View style={themed($card)}>
          <Text preset="bold" style={themed($sectionTitle)}>
            Vault Entry Code
          </Text>
          <Text style={themed($metaText)}>
            Status: {realConfigured ? "Configured" : "Not configured"}
          </Text>
          <Text style={themed($metaText)}>
            Exact digits only. Entering the code in the calculator opens the normal vault access path.
          </Text>
          <TextField
            label="New Vault Entry Code"
            placeholder="4 to 8 digits"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            value={vaultEntryCode}
            onChangeText={setVaultEntryCodeInput}
          />
          <Pressable style={themed($primaryButton)} onPress={handleSaveVaultCode}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              {realConfigured ? "Update Vault Entry Code" : "Set Vault Entry Code"}
            </Text>
          </Pressable>
          {realConfigured ? (
            <Pressable style={themed($secondaryButton)} onPress={handleRemoveVaultCode}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Remove Vault Entry Code
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={themed($card)}>
          <Text preset="bold" style={themed($sectionTitle)}>
            Decoy Entry Code
          </Text>
          <Text style={themed($metaText)}>{decoySummary}</Text>
          <Text style={themed($metaText)}>
            Exact digits only. Entering the decoy code in the calculator opens the isolated decoy vault.
          </Text>
          <TextField
            label="New Decoy Entry Code"
            placeholder="4 to 8 digits"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={8}
            value={decoyEntryCode}
            onChangeText={setDecoyEntryCodeInput}
          />
          <Pressable style={themed($primaryButton)} onPress={handleSaveDecoyCode}>
            <Text preset="bold" style={themed($primaryButtonText)}>
              Update Decoy Entry Code
            </Text>
          </Pressable>
          {customDecoyConfigured ? (
            <Pressable style={themed($secondaryButton)} onPress={handleResetDecoyCode}>
              <Text preset="bold" style={themed($secondaryButtonText)}>
                Reset Decoy Code to Default
              </Text>
            </Pressable>
          ) : null}
        </View>

        {error ? <Text style={themed($errorText)}>{error}</Text> : null}
        {status ? <Text style={themed($statusText)}>{status}</Text> : null}

        <Pressable style={themed($linkButton)} onPress={() => navigation.goBack()}>
          <Text preset="bold" style={themed($linkText)}>
            Back
          </Text>
        </Pressable>
      </Screen>
    )
  }

const $screen: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
})

const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
  marginBottom: spacing.md,
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
  marginBottom: 8,
})

const $card: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glass,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: colors.glassBorder,
  padding: spacing.lg,
  marginHorizontal: spacing.lg,
  marginBottom: spacing.lg,
})

const $sectionTitle: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textStrong,
  marginBottom: spacing.sm,
})

const $metaText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  marginBottom: spacing.sm,
  lineHeight: 20,
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.accentPink,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginTop: spacing.sm,
  marginBottom: spacing.sm,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $secondaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.glassHeavy,
  borderRadius: 14,
  paddingVertical: spacing.md,
  alignItems: "center",
  borderWidth: 1,
  borderColor: colors.glassBorder,
})

const $secondaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textStrong,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginHorizontal: spacing.lg,
  marginBottom: spacing.sm,
})

const $statusText: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.textMuted,
  marginHorizontal: spacing.lg,
  marginBottom: spacing.sm,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  marginBottom: spacing.xl,
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textMuted,
})

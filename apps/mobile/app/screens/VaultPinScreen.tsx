import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { getMeta, unlockLegacyVault } from "@/locker/storage/vaultMetaRepo"
import { getPostUnlockRoute } from "@/navigators/postUnlockRoute"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

const MAX_PIN_LENGTH = 6

type PinError = "incorrect" | "corrupt" | null

export const VaultPinScreen: FC<AppStackScreenProps<"VaultPin">> = function VaultPinScreen(props) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [pin, setPin] = useState("")
  const [error, setError] = useState<PinError>(null)
  const meta = useMemo(() => getMeta(), [])

  useFocusEffect(
    useCallback(() => {
      if (vaultSession.isUnlocked()) {
        const next = getPostUnlockRoute()
        if (next.name === "VaultSelection") {
          navigation.replace("VaultSelection")
          return
        }
        navigation.replace(next.name, next.params)
      }
    }, [navigation]),
  )

  useEffect(() => {
    setError(null)
  }, [pin])

  useEffect(() => {
    if (pin.length !== MAX_PIN_LENGTH) return
    const result = unlockLegacyVault(pin)
    if ("vmk" in result) {
      vaultSession.setKey(result.vmk)
      Alert.alert("Enable Passkey", "Passkey unlock is faster and more secure.", [
        {
          text: "Enable Passkey",
          onPress: () => navigation.replace("VaultPasskeySetup", { mode: "migrate" }),
        },
        {
          text: "Later",
          style: "cancel",
          onPress: () => {
            const next = getPostUnlockRoute()
            if (next.name === "VaultSelection") {
              navigation.replace("VaultSelection")
              return
            }
            navigation.replace(next.name, next.params)
          },
        },
      ])
    } else {
      setError(result.error)
      setPin("")
    }
  }, [pin, navigation])

  const headerText = useMemo(() => {
    if (!meta || meta.v !== 1) return "No legacy PIN vault"
    return "Enter your legacy PIN"
  }, [meta])

  const errorText = useMemo(() => {
    if (error === "incorrect") return "Incorrect PIN"
    if (error === "corrupt") return "Vault data error"
    return ""
  }, [error])

  const handleDigit = (digit: string) => {
    if (!meta || meta.v !== 1) return
    if (pin.length >= MAX_PIN_LENGTH) return
    setPin((prev) => `${prev}${digit}`)
  }

  const handleBackspace = () => {
    if (pin.length === 0) return
    setPin((prev) => prev.slice(0, -1))
  }

  const handleClear = () => {
    setPin("")
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])} keyboardAvoidingEnabled={false}>
      <View style={themed($card)}>
        <Text preset="heading" style={themed($title)}>
          Locker
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          {headerText}
        </Text>

        <View style={themed($pinRow)}>
          {Array.from({ length: MAX_PIN_LENGTH }).map((_, index) => (
            <View
              key={`pin-dot-${index}`}
              style={themed([$pinDot, index < pin.length && $pinDotFilled])}
            />
          ))}
        </View>

        {error ? <Text style={themed($errorText)}>{errorText}</Text> : null}

        <View style={themed($keypad)}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <Pressable
              key={digit}
              onPress={() => handleDigit(digit)}
              style={({ pressed }) => [themed($key), pressed && themed($keyPressed)]}
            >
              <Text preset="subheading" style={themed($keyText)}>
                {digit}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={handleClear}
            style={({ pressed }) => [themed($keyAlt), pressed && themed($keyPressed)]}
          >
            <Text preset="subheading" style={themed($keyText)}>
              Clear
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleDigit("0")}
            style={({ pressed }) => [themed($key), pressed && themed($keyPressed)]}
          >
            <Text preset="subheading" style={themed($keyText)}>
              0
            </Text>
          </Pressable>
          <Pressable
            onPress={handleBackspace}
            style={({ pressed }) => [themed($keyAlt), pressed && themed($keyPressed)]}
          >
            <Text preset="subheading" style={themed($keyText)}>
              ⌫
            </Text>
          </Pressable>
        </View>

        <Pressable style={themed($linkButton)} onPress={() => navigation.goBack()}>
          <Text preset="bold" style={themed($linkText)}>
            Back
          </Text>
        </Pressable>
      </View>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  backgroundColor: colors.palette.neutral900,
  justifyContent: "center",
  paddingHorizontal: spacing.xl,
})

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 24,
  padding: spacing.xl,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.2)",
})

const $title: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  marginBottom: 4,
})

const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
  marginBottom: 16,
})

const $pinRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.sm,
  marginBottom: spacing.md,
})

const $pinDot: ThemedStyle<ViewStyle> = () => ({
  width: 12,
  height: 12,
  borderRadius: 6,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.5)",
})

const $pinDotFilled: ThemedStyle<ViewStyle> = () => ({
  backgroundColor: "rgba(255, 255, 255, 0.9)",
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
  textAlign: "center",
  marginBottom: 12,
})

const $keypad: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "space-between",
  rowGap: spacing.md,
})

const $key: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "30%",
  paddingVertical: spacing.md,
  borderRadius: 16,
  alignItems: "center",
  backgroundColor: "rgba(255, 255, 255, 0.14)",
})

const $keyAlt: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "30%",
  paddingVertical: spacing.md,
  borderRadius: 16,
  alignItems: "center",
  backgroundColor: "rgba(255, 255, 255, 0.08)",
})

const $keyPressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.7,
})

const $keyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

const $linkButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.lg,
  alignItems: "center",
})

const $linkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

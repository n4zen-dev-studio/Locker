import { FC, useCallback, useEffect, useMemo, useState } from "react"
import { Alert, Pressable, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { getVaultMetaState, initializeVault, resetVaultMeta, unlockVault } from "@/locker/storage/vaultMetaRepo"
import { resetNotes } from "@/locker/storage/notesRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

const MAX_PIN_LENGTH = 6

type Mode = "setup" | "confirm" | "unlock"

type PinError = "incorrect" | "mismatch" | "corrupt" | null

export const VaultPinScreen: FC<AppStackScreenProps<"VaultPin">> = function VaultPinScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])
  const [processing, setProcessing] = useState(false)


  const [mode, setMode] = useState<Mode>(() => {
    const state = getVaultMetaState()
    return state.status === "ready" ? "unlock" : "setup"
  })
  const [error, setError] = useState<PinError>(() => {
    const state = getVaultMetaState()
    return state.status === "corrupt" ? "corrupt" : null
  })
  const [pin, setPin] = useState("")
  const [firstPin, setFirstPin] = useState("")
  const hasCorruptVault = error === "corrupt"

  useFocusEffect(
    useCallback(() => {
      if (vaultSession.isUnlocked()) {
        navigation.replace("VaultHome")
      }
    }, [navigation]),
  )

  useEffect(() => {
    if (!hasCorruptVault) setError(null)
  }, [pin, hasCorruptVault])

  // useEffect(() => {
  //   if (pin.length !== MAX_PIN_LENGTH) return

  //   console.log("PIN entered:", pin, "Mode:", mode)

  //   if (mode === "setup") {
  //     setFirstPin(pin)
  //     setPin("")
  //     setMode("confirm")
  //     return
  //   }

  //   if (mode === "confirm") {
  //     if (pin !== firstPin) {
  //       setError("mismatch")
  //       setPin("")
  //       setFirstPin("")
  //       setMode("setup")
  //       return
  //     }
  //     const vmk = initializeVault(pin)
  //     vaultSession.setKey(vmk)
  //     navigation.replace("VaultHome")
  //     return
  //   }

  //   if (mode === "unlock") {
  //     setProcessing(true)
  //     setTimeout(() => {
  //       const result = unlockVault(pin)
  //       if ("vmk" in result) {
  //         vaultSession.setKey(result.vmk)
  //         navigation.replace("VaultHome")
  //       } else {
  //         setError(result.error === "corrupt" ? "corrupt" : "incorrect")
  //         setPin("")
  //       }
  //       setProcessing(false)
  //     }, 0)
  //   }

  // }, [pin, mode, firstPin, navigation])

  useEffect(() => {
  if (processing) return
  if (pin.length !== MAX_PIN_LENGTH) return

  setProcessing(true)

  setTimeout(() => {
    try {
      if (mode === "setup") {
        setFirstPin(pin)
        setPin("")
        setMode("confirm")
        return
      }

      if (mode === "confirm") {
        if (pin !== firstPin) {
          setError("mismatch")
          setPin("")
          setFirstPin("")
          setMode("setup")
          return
        }
        const vmk = initializeVault(pin)
        vaultSession.setKey(vmk)
        navigation.replace("VaultHome")
        return
      }

      const result = unlockVault(pin)
      if ("vmk" in result) {
        vaultSession.setKey(result.vmk)
        navigation.replace("VaultHome")
      } else {
        setError(result.error === "corrupt" ? "corrupt" : "incorrect")
        setPin("")
      }
    } finally {
      setProcessing(false)
    }
  }, 0)
}, [pin, mode, firstPin, navigation, processing])


  const headerText = useMemo(() => {
    if (hasCorruptVault) return "Vault data error"
    if (mode === "setup") return "Set a 6-digit PIN"
    if (mode === "confirm") return "Confirm your PIN"
    return "Enter your PIN"
  }, [mode, hasCorruptVault])

  const errorText = useMemo(() => {
    if (error === "incorrect") return "Incorrect PIN"
    if (error === "mismatch") return "PINs do not match"
    if (error === "corrupt") return "Vault data error"
    return ""
  }, [error])

const handleDigit = (digit: string) => {
  if (processing || hasCorruptVault) return
  if (pin.length >= MAX_PIN_LENGTH) return
  setPin((prev) => `${prev}${digit}`)
}

const handleBackspace = () => {
  if (processing || hasCorruptVault) return
  if (pin.length === 0) return
  setPin((prev) => prev.slice(0, -1))
}

const handleClear = () => {
  if (processing || hasCorruptVault) return
  setPin("")
}

  const handleReset = () => {
    Alert.alert("Reset Vault", "This will erase all local vault data.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          resetVaultMeta()
          resetNotes()
          vaultSession.clear()
          setMode("setup")
          setFirstPin("")
          setPin("")
          setError(null)
        },
      },
    ])
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
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
        {processing ? <Text style={themed($subtitle)}>Unlocking…</Text> : null}


        {__DEV__ ? (
          <Pressable style={themed($resetButton)} onPress={handleReset}>
            <Text preset="bold" style={themed($resetText)}>
              Reset Vault (Dev)
            </Text>
          </Pressable>
        ) : null}
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

const $resetButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.lg,
  alignItems: "center",
})

const $resetText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
})

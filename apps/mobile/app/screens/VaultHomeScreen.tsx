import { FC, useCallback, useState } from "react"
import { Alert, AppState, Pressable, ScrollView, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { listNotes, resetNotes, Note } from "@/locker/storage/notesRepo"
import { resetVaultMeta } from "@/locker/storage/vaultMetaRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultHomeScreen: FC<AppStackScreenProps<"VaultHome">> = function VaultHomeScreen(
  props,
) {
  const { navigation } = props
  const { themed } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [notes, setNotes] = useState<Note[]>([])
  const [error, setError] = useState<string | null>(null)

  const refreshNotes = useCallback(() => {
    const key = vaultSession.getKey()
    if (!key) return
    try {
      setNotes(listNotes(key))
      setError(null)
    } catch {
      setError("Vault data error")
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      refreshNotes()
    }, [navigation, refreshNotes]),
  )

  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener("change", (state) => {
        if (state === "active" && !vaultSession.isUnlocked()) {
          navigation.replace("VaultLocked")
        }
      })
      return () => sub.remove()
    }, [navigation]),
  )

  const handleLock = () => {
    vaultSession.clear()
    navigation.popToTop()
    navigation.replace("Calculator")
  }

  const handleReset = () => {
    Alert.alert("Reset Vault", "This will erase all local vault data.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => {
          resetNotes()
          resetVaultMeta()
          vaultSession.clear()
          navigation.replace("VaultLocked")
        },
      },
    ])
  }

  return (
    <Screen preset="fixed" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Locker
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          Device Vault
        </Text>
      </View>

      <Pressable style={themed($primaryButton)} onPress={() => navigation.navigate("VaultNote", {})}>
        <Text preset="bold" style={themed($primaryButtonText)}>
          New Secure Note
        </Text>
      </Pressable>

      {error ? (
        <View style={themed($errorCard)}>
          <Text style={themed($errorText)}>{error}</Text>
          {__DEV__ ? (
            <Pressable style={themed($resetButton)} onPress={handleReset}>
              <Text preset="bold" style={themed($resetText)}>
                Reset Vault (Dev)
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={themed($list)}>
        {notes.length === 0 ? (
          <View style={themed($emptyCard)}>
            <Text style={themed($emptyText)}>No secure notes yet.</Text>
          </View>
        ) : (
          notes.map((note) => (
            <Pressable
              key={note.id}
              style={({ pressed }) => [themed($noteCard), pressed && themed($notePressed)]}
              onPress={() => navigation.navigate("VaultNote", { noteId: note.id })}
            >
              <Text preset="bold" style={themed($noteTitle)} numberOfLines={1}>
                {note.title || "Untitled"}
              </Text>
              <Text style={themed($noteMeta)}>{new Date(note.updatedAt).toLocaleString()}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Pressable style={themed($lockButton)} onPress={handleLock}>
        <Text preset="bold" style={themed($lockText)}>
          Lock Vault
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

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 16,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginBottom: spacing.lg,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $list: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingBottom: spacing.xl,
  gap: spacing.md,
})

const $noteCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 18,
  padding: spacing.md,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.1)",
})

const $notePressed: ThemedStyle<ViewStyle> = () => ({
  opacity: 0.8,
})

const $noteTitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  marginBottom: 4,
})

const $noteMeta: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral400,
  fontSize: 12,
})

const $emptyCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  borderRadius: 18,
  padding: spacing.lg,
  alignItems: "center",
})

const $emptyText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral300,
})

const $lockButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  marginTop: spacing.md,
  marginBottom: spacing.lg,
  alignItems: "center",
  paddingVertical: spacing.sm,
  borderRadius: 12,
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.15)",
})

const $lockText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
})

const $errorCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(192, 52, 3, 0.25)",
  borderRadius: 16,
  padding: spacing.md,
  marginBottom: spacing.md,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  marginBottom: 8,
})

const $resetButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingVertical: spacing.sm,
})

const $resetText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})

import { FC, useCallback, useEffect, useState } from "react"
import { AppState, Pressable, TextInput, TextStyle, View, ViewStyle } from "react-native"
import { useFocusEffect } from "@react-navigation/native"

import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import type { AppStackScreenProps } from "@/navigators/navigationTypes"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { vaultSession } from "@/locker/session"
import { deleteNote, getNote, saveNote } from "@/locker/storage/notesRepo"
import { getRemoteVaultId } from "@/locker/storage/remoteVaultRepo"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export const VaultNoteScreen: FC<AppStackScreenProps<"VaultNote">> = function VaultNoteScreen(
  props,
) {
  const { navigation, route } = props
  const { themed, theme } = useAppTheme()
  const $insets = useSafeAreaInsetsStyle(["top", "bottom"])

  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [vaultId, setVaultId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isExisting, setIsExisting] = useState(false)

  const noteId = route.params?.noteId

  const loadNote = useCallback(() => {
    const key = vaultSession.getKey()
    if (!key || !noteId) return
    try {
      const note = getNote(noteId, key)
      setTitle(note.title)
      setBody(note.body)
      setVaultId(note.vaultId ?? null)
      setIsExisting(true)
      setError(null)
    } catch {
      setError("Vault data error")
    }
  }, [noteId])

  useFocusEffect(
    useCallback(() => {
      if (!vaultSession.isUnlocked()) {
        navigation.replace("VaultLocked")
        return
      }
      loadNote()
    }, [navigation, loadNote]),
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

  useEffect(() => {
    if (!noteId) {
      setIsExisting(false)
      setTitle("")
      setBody("")
      setVaultId(getRemoteVaultId())
      setError(null)
    }
  }, [noteId])

  const handleSave = () => {
    const key = vaultSession.getKey()
    if (!key) return
    const saved = saveNote({ id: noteId, title: title.trim(), body, vaultId }, key)
    navigation.replace("VaultNote", { noteId: saved.id })
  }

  const handleDelete = () => {
    if (!noteId) return
    const key = vaultSession.getKey()
    deleteNote(noteId, key ?? undefined)
    navigation.goBack()
  }

  return (
    <Screen preset="scroll" contentContainerStyle={themed([$screen, $insets])}>
      <View style={themed($header)}>
        <Text preset="heading" style={themed($title)}>
          Secure Note
        </Text>
        <Text preset="subheading" style={themed($subtitle)}>
          {noteId ? "Edit" : "New"}
        </Text>
      </View>

      {error ? <Text style={themed($errorText)}>{error}</Text> : null}

      <View style={themed($card)}>
        <TextInput
          placeholder="Title"
          placeholderTextColor={theme.colors.palette.neutral400}
          style={themed($titleInput)}
          value={title}
          onChangeText={setTitle}
        />
        <View style={themed($divider)} />
        <TextInput
          placeholder="Write your note..."
          placeholderTextColor={theme.colors.palette.neutral400}
          style={themed($bodyInput)}
          value={body}
          onChangeText={setBody}
          multiline
        />
      </View>

      <Pressable style={themed($primaryButton)} onPress={handleSave}>
        <Text preset="bold" style={themed($primaryButtonText)}>
          Save Note
        </Text>
      </Pressable>

      {isExisting ? (
        <Pressable style={themed($deleteButton)} onPress={handleDelete}>
          <Text preset="bold" style={themed($deleteButtonText)}>
            Delete Note
          </Text>
        </Pressable>
      ) : null}
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

const $card: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  backgroundColor: "rgba(255, 255, 255, 0.08)",
  borderRadius: 20,
  padding: spacing.lg,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.1)",
  marginBottom: spacing.lg,
})

const $divider: ThemedStyle<ViewStyle> = () => ({
  height: 1,
  backgroundColor: "rgba(255, 255, 255, 0.1)",
  marginVertical: 12,
})

const $titleInput: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 18,
  fontWeight: "600",
})

const $bodyInput: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral200,
  fontSize: 16,
  minHeight: 180,
  textAlignVertical: "top",
})

const $primaryButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  backgroundColor: colors.palette.primary300,
  borderRadius: 16,
  paddingVertical: spacing.md,
  alignItems: "center",
  marginBottom: spacing.md,
})

const $primaryButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral900,
})

const $deleteButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  paddingVertical: spacing.sm,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: "rgba(255, 255, 255, 0.2)",
})

const $deleteButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
})

const $errorText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.angry500,
  marginBottom: 12,
})

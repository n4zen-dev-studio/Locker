import { FC } from "react"
import { Modal, Platform, Pressable, TextStyle, View, ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import WebView from "react-native-webview"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import type { VaultItemType } from "@/locker/vault/types"

type SecureItemViewerModalProps = {
  visible: boolean
  title: string
  subtitle?: string
  itemType: VaultItemType
  sourceUri?: string
  dataUri?: string
  html?: string
  fallbackMessage?: string
  onClose: () => void
  onExport?: () => void
}

export const SecureItemViewerModal: FC<SecureItemViewerModalProps> = ({
  visible,
  title,
  subtitle,
  itemType,
  sourceUri,
  dataUri,
  html,
  fallbackMessage,
  onClose,
  onExport,
}) => {
  const { themed } = useAppTheme()

  const imageHtml = dataUri
    ? `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" /></head><body style="margin:0;background:#05050a;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${dataUri}" style="max-width:100%;height:auto;object-fit:contain;" /></body></html>`
    : undefined

  const canRenderWebView =
    !!html || !!imageHtml || itemType === "pdf" || itemType === "image" || (itemType === "doc" && !!sourceUri)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={themed($root)}>
        <View style={themed($header)}>
          <View style={themed($headerCopy)}>
            <Text preset="bold" style={themed($title)}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={themed($subtitle)} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          <View style={themed($headerActions)}>
            {onExport ? (
              <Pressable onPress={onExport} style={themed($headerButton)}>
                <Ionicons name="download-outline" size={18} color="#fff" />
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} style={themed($headerButton)}>
              <Ionicons name="close-outline" size={22} color="#fff" />
            </Pressable>
          </View>
        </View>

        <View style={themed($viewerFrame)}>
          {canRenderWebView ? (
            <WebView
              source={
                html
                  ? { html }
                  : imageHtml
                    ? { html: imageHtml }
                    : sourceUri
                      ? { uri: sourceUri }
                      : { html: "<html><body></body></html>" }
              }
              originWhitelist={["*"]}
              allowFileAccess
              allowingReadAccessToURL={sourceUri}
              setBuiltInZoomControls
              scalesPageToFit={Platform.OS !== "android"}
              style={themed($webview)}
            />
          ) : (
            <View style={themed($fallback)}>
              <Ionicons name="shield-checkmark-outline" size={28} color="#f5d8ff" />
              <Text style={themed($fallbackTitle)}>Secure preview unavailable</Text>
              <Text style={themed($fallbackText)}>
                {fallbackMessage ?? "This format can still be exported from the vault without leaving this screen."}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  )
}

const $root: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  backgroundColor: "#05060A",
  paddingTop: 56,
  paddingHorizontal: 16,
  paddingBottom: 20,
})

const $header: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 12,
  marginBottom: 16,
})

const $headerCopy: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
})

const $title: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
})

const $subtitle: ThemedStyle<TextStyle> = () => ({
  color: "rgba(228,227,234,0.74)",
  fontSize: 12,
  marginTop: 4,
})

const $headerActions: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  gap: 10,
})

const $headerButton: ThemedStyle<ViewStyle> = () => ({
  width: 42,
  height: 42,
  borderRadius: 16,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,255,255,0.07)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
})

const $viewerFrame: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  overflow: "hidden",
  borderRadius: 28,
  backgroundColor: "rgba(255,255,255,0.04)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.09)",
})

const $webview: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  backgroundColor: "#05060A",
})

const $fallback: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 28,
  gap: 10,
})

const $fallbackTitle: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontSize: 18,
  fontWeight: "700",
})

const $fallbackText: ThemedStyle<TextStyle> = () => ({
  color: "rgba(228,227,234,0.74)",
  fontSize: 14,
  lineHeight: 22,
  textAlign: "center",
})

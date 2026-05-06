import React, { FC } from "react"
import {
  Dimensions,
  FlatList,
  Image,
  ImageStyle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextStyle,
  View,
  ViewStyle,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import WebView from "react-native-webview"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import type { VaultItemType } from "@/locker/vault/types"
import Pdf from "react-native-pdf"

type SecureItemViewerModalProps = {
  visible: boolean
  title: string
  subtitle?: string
  itemType: VaultItemType
  sourceUri?: string
  dataUri?: string
  html?: string
  imageItems?: Array<{ id: string; title: string; uri: string }>
  initialImageIndex?: number
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
  imageItems,
  initialImageIndex = 0,
  fallbackMessage,
  onClose,
  onExport,
}) => {
  const { themed } = useAppTheme()
  const galleryRef = React.useRef<FlatList<{ id: string; title: string; uri: string }> | null>(null)
  const [currentImageIndex, setCurrentImageIndex] = React.useState(initialImageIndex)
  const screenWidth = Dimensions.get("window").width - 32

  const imageHtml = dataUri
    ? `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes" /></head><body style="margin:0;background:#05050a;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${dataUri}" style="max-width:100%;height:auto;object-fit:contain;" /></body></html>`
    : undefined

  React.useEffect(() => {
    if (!visible || itemType !== "image" || !imageItems?.length) return
    setCurrentImageIndex(initialImageIndex)
    requestAnimationFrame(() => {
      galleryRef.current?.scrollToOffset({ offset: initialImageIndex * screenWidth, animated: false })
    })
  }, [imageItems, initialImageIndex, itemType, screenWidth, visible])

  const canRenderWebView =
    !!html || !!imageHtml || itemType === "image"

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
  {itemType === "image" && imageItems?.length ? (
    <>
      <FlatList
        ref={galleryRef}
        data={imageItems}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(event) => {
          const width = event.nativeEvent.layoutMeasurement.width
          const offset = event.nativeEvent.contentOffset.x
          setCurrentImageIndex(width > 0 ? Math.round(offset / width) : 0)
        }}
        renderItem={({ item }) => (
          <View style={themed($imageSlide)}>
            <ScrollView
              maximumZoomScale={4}
              minimumZoomScale={1}
              contentContainerStyle={themed($imageZoomContainer)}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image source={{ uri: item.uri }} style={themed($galleryImage)} resizeMode="contain" />
            </ScrollView>
          </View>
        )}
      />
      <View style={themed($galleryPill)}>
        <Text style={themed($galleryPillText)}>
          {currentImageIndex + 1} / {imageItems.length}
        </Text>
      </View>
    </>
  ) : itemType === "pdf" && sourceUri ? (
    <Pdf
      source={{ uri: sourceUri }}
      style={{ flex: 1 }}
      trustAllCerts={false}
      enablePaging={false}
      fitPolicy={0}
      renderActivityIndicator={() => (
        <View style={themed($fallback)}>
          <Text style={themed($fallbackText)}>Loading PDF…</Text>
        </View>
      )}
      onError={(error) => {
        console.warn("PDF viewer error", error)
      }}
    />
     ) : itemType === "doc" ? (
  <View style={themed($fallback)}>
    <Ionicons name="document-text-outline" size={28} color="#f5d8ff" />
    <Text style={themed($fallbackTitle)}>Preview not available</Text>
    <Text style={themed($fallbackText)}>
      This document is securely stored. You can download it to view externally.
    </Text>
  </View>
) : canRenderWebView ? (
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

const $imageSlide: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  width: Dimensions.get("window").width - 32,
})

const $imageZoomContainer: ThemedStyle<ViewStyle> = () => ({
  flexGrow: 1,
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: "#05060A",
})

const $galleryImage: ThemedStyle<ImageStyle> = () => ({
  width: "100%",
  height: "100%",
})

const $galleryPill: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  bottom: 18,
  alignSelf: "center",
  borderRadius: 999,
  paddingHorizontal: 12,
  paddingVertical: 8,
  backgroundColor: "rgba(8,8,14,0.72)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.12)",
})

const $galleryPillText: ThemedStyle<TextStyle> = () => ({
  color: "#fff",
  fontSize: 12,
  fontWeight: "700",
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

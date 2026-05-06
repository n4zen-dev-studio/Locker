import Animated from "react-native-reanimated"
import { View, type TextStyle, type ViewStyle } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { Download, Mic } from "lucide-react-native"

import { Text } from "@/components/Text"
import type { ThemedStyle } from "@/theme/types"

import { MetaChip } from "./MetaChip"
import { MiniIconButton } from "./MiniIconButton"
import type { VaultThemed } from "./types"
import { VOICE_BARS } from "./utils"

type Props = {
  themed: VaultThemed
  title: string
  pulseStyle: ViewStyle
  isRecording: boolean
  isRecordingPaused: boolean
  isPlaying: boolean
  durationLabel: string
  playbackLabel: string
  canRecord: boolean
  hasVoice: boolean
  onStartRecord: () => void
  onPauseRecord: () => void
  onStopRecord: () => void
  onPlayPause: () => void
  onStopPlayback: () => void
  onExport: () => void
}

export function VoiceStudioCard(props: Props) {
  const {
    themed,
    title,
    pulseStyle,
    isRecording,
    isRecordingPaused,
    isPlaying,
    durationLabel,
    playbackLabel,
    canRecord,
    hasVoice,
    onStartRecord,
    onPauseRecord,
    onStopRecord,
    onPlayPause,
    onStopPlayback,
    onExport,
  } = props

  return (
    <View style={themed($voiceCard)}>
      <View style={themed($voiceHeader)}>
        <View>
          <Text style={themed($voiceTitle)}>{title}</Text>
          <Text style={themed($voiceSubtitle)}>
            {isRecording ? (isRecordingPaused ? "Recording paused" : "Recording live") : hasVoice ? "Encrypted playback ready" : "Create a secure voice item"}
          </Text>
        </View>
        <View style={themed($voiceBadge)}>
          <Mic size={14} color="#120913" />
          <Text style={themed($voiceBadgeText)}>{durationLabel}</Text>
        </View>
      </View>

      <View style={themed($voiceOrbShell)}>
        <Animated.View style={[themed($voicePulseRing), pulseStyle]} />
        <View style={themed($voiceOrbCore)}>
          <Mic size={28} color="#fff" />
        </View>
      </View>

      <View style={themed($waveRow)}>
        {VOICE_BARS.map((height, index) => (
          <View
            key={index}
            style={[
              themed($waveBar),
              {
                height,
                opacity: isRecording || isPlaying ? 1 : 0.45,
              },
            ]}
          />
        ))}
      </View>

      <View style={themed($voiceMetaRow)}>
        <MetaChip themed={themed} label={`Duration ${durationLabel}`} />
        <MetaChip themed={themed} label={`Playback ${playbackLabel}`} />
      </View>

      <View style={themed($voiceControls)}>
        {!isRecording ? (
          <MiniIconButton
            themed={themed}
            label="Record"
            icon={<Mic size={14} color="#FFE8FD" />}
            onPress={onStartRecord}
            disabled={!canRecord}
          />
        ) : (
          <>
            <MiniIconButton
              themed={themed}
              label={isRecordingPaused ? "Resume" : "Pause"}
              icon={<Ionicons name={isRecordingPaused ? "play" : "pause"} size={14} color="#FFE8FD" />}
              onPress={onPauseRecord}
            />
            <MiniIconButton
              themed={themed}
              label="Stop"
              icon={<Ionicons name="stop" size={14} color="#FFE8FD" />}
              onPress={onStopRecord}
            />
          </>
        )}

        <MiniIconButton
          themed={themed}
          label={isPlaying ? "Pause" : "Play"}
          icon={<Ionicons name={isPlaying ? "pause" : "play"} size={14} color="#FFE8FD" />}
          onPress={onPlayPause}
          disabled={!hasVoice}
        />
        <MiniIconButton
          themed={themed}
          label="Stop"
          icon={<Ionicons name="square" size={14} color="#FFE8FD" />}
          onPress={onStopPlayback}
          disabled={!hasVoice}
        />
        <MiniIconButton
          themed={themed}
          label="Export"
          icon={<Download size={14} color="#FFE8FD" />}
          onPress={onExport}
          disabled={!hasVoice}
        />
      </View>
    </View>
  )
}

const $voiceCard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  padding: spacing.sm,
  borderRadius: 22,
  backgroundColor: "rgba(255,255,255,0.05)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.08)",
  gap: spacing.sm,
})

const $voiceHeader: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
})

const $voiceTitle: ThemedStyle<TextStyle> = () => ({
  color: "#FFF6FF",
  fontSize: 16,
  fontWeight: "700",
})

const $voiceSubtitle: ThemedStyle<TextStyle> = () => ({
  marginTop: 4,
  color: "rgba(255,235,255,0.68)",
  fontSize: 11,
})

const $voiceBadge: ThemedStyle<ViewStyle> = () => ({
  flexDirection: "row",
  alignItems: "center",
  gap: 6,
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderRadius: 999,
  backgroundColor: "#E9FF94",
})

const $voiceBadgeText: ThemedStyle<TextStyle> = () => ({
  color: "#160714",
  fontSize: 11,
  fontWeight: "800",
})

const $voiceOrbShell: ThemedStyle<ViewStyle> = () => ({
  alignSelf: "center",
  width: 148,
  height: 148,
  borderRadius: 74,
  alignItems: "center",
  justifyContent: "center",
})

const $voicePulseRing: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  width: 148,
  height: 148,
  borderRadius: 74,
  backgroundColor: "rgba(255,122,225,0.14)",
  borderWidth: 1,
  borderColor: "rgba(255,150,236,0.26)",
})

const $voiceOrbCore: ThemedStyle<ViewStyle> = () => ({
  width: 92,
  height: 92,
  borderRadius: 46,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "rgba(255,122,225,0.22)",
  borderWidth: 1,
  borderColor: "rgba(255,190,244,0.3)",
  shadowColor: "#FF73E5",
  shadowOpacity: 0.22,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 12 },
  elevation: 10,
})

const $waveRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-end",
  justifyContent: "center",
  gap: spacing.xs,
  minHeight: 48,
})

const $waveBar: ThemedStyle<ViewStyle> = () => ({
  width: 8,
  borderRadius: 999,
  backgroundColor: "rgba(255,172,239,0.78)",
})

const $voiceMetaRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})

const $voiceControls: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
  justifyContent: "center",
})

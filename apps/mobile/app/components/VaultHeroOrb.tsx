import React, { FC, useEffect, useMemo } from "react"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import { LinearGradient } from "expo-linear-gradient"
import Svg, {
  Defs,
  RadialGradient as SvgRadialGradient,
  Stop,
  Circle,
  Path,
} from "react-native-svg"
import { MaterialCommunityIcons } from "@expo/vector-icons"
import { useAppTheme } from "@/theme/context"

type VaultHeroOrbAction = {
  id: string
  label: string
  onPress: () => void
  icon: "note" | "image" | "pdf" | "file"
}

type VaultHeroOrbProps = {
  actions: VaultHeroOrbAction[]
  reducedMotion?: boolean
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
const AnimatedView = Animated.createAnimatedComponent(View)

const CANVAS_SIZE = 320
const CENTER_SIZE = 104
const SATELLITE_SIZE = 78

const CENTER_RADIUS = CENTER_SIZE / 2
const SATELLITE_RADIUS = SATELLITE_SIZE / 2

/**
 * These are the visual positions that better match your screenshot:
 * - note: top-left
 * - image: top-right
 * - pdf: bottom-left
 * - file: bottom-right, slightly closer to the center
 */
const SLOT_LAYOUT = [
  { angle: -132, distance: 112 }, // note
  { angle: -42, distance: 108 },  // image
  { angle: 138, distance: 114 },  // pdf
  { angle: 48, distance: 114 },    // file (closer like screenshot)
] as const

const ICON_MAP: Record<VaultHeroOrbAction["icon"], keyof typeof MaterialCommunityIcons.glyphMap> = {
  note: "file-document-outline",
  image: "image-outline",
  pdf: "file-pdf-box",
  file: "file-outline",
}

const ORB_THEMES: Record<
  VaultHeroOrbAction["icon"],
  {
    shellTop: string
    shellBottom: string
    glow: string
    glowSoft: string
    icon: string
    ring: string
    halo: string
  }
> = {
  note: {
    shellTop: "#E7BC85",
    shellBottom: "#a35b09",
    glow: "#FFD39B",
    glowSoft: "rgba(255,211,155,0.22)",
    icon: "#FFF8EF",
    ring: "rgba(255,255,255,0.18)",
    halo: "rgba(245,191,121,0.24)",
  },
  image: {
    shellTop: "#0F2C24",
    shellBottom: "#071612",
    glow: "#47F0A2",
    glowSoft: "rgba(71,240,162,0.24)",
    icon: "#F4FFF8",
    ring: "rgba(147,255,205,0.18)",
    halo: "rgba(63,241,160,0.22)",
  },
  pdf: {
    shellTop: "#0D4DB5",
    shellBottom: "#032760",
    glow: "#D6FF5A",
    glowSoft: "rgba(214,255,90,0.24)",
    icon: "#F6FFDA",
    ring: "rgba(255,255,255,0.16)",
    halo: "rgba(187,255,73,0.22)",
  },
  file: {
    shellTop: "#999999",
    shellBottom: "#585858",
    glow: "#FFFFFF",
    glowSoft: "rgba(255,255,255,0.26)",
    icon: "#FFFFFF",
    ring: "rgba(255,255,255,0.16)",
    halo: "rgba(255,255,255,0.2)",
  },
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180
}

function getOrbOffset(angle: number, distance: number) {
  const r = degToRad(angle)
  return {
    x: Math.cos(r) * distance,
    y: Math.sin(r) * distance,
  }
}

/**
 * Curved connector between center orb and satellite orb.
 * This makes the connector feel more like the reference image:
 * - thinner
 * - softer
 * - a bit curved instead of rigidly straight
 */
function getCurvedConnectorPath(
  x: number,
  y: number,
  centerRadius: number,
  satelliteRadius: number,
  thickness: number,
  bend = 4,
) {
  const angle = Math.atan2(y, x)
  const nx = Math.cos(angle)
  const ny = Math.sin(angle)
  const px = -ny
  const py = nx
  const half = thickness / 2

  const startX = nx * centerRadius
  const startY = ny * centerRadius
  const endX = x - nx * satelliteRadius
  const endY = y - ny * satelliteRadius

  const midX = (startX + endX) / 2 + px * bend
  const midY = (startY + endY) / 2 + py * bend

  const s1x = startX + px * half
  const s1y = startY + py * half
  const s2x = startX - px * half
  const s2y = startY - py * half

  const e1x = endX + px * half
  const e1y = endY + py * half
  const e2x = endX - px * half
  const e2y = endY - py * half

  const c1x = midX + px * half * 0.28
  const c1y = midY + py * half * 0.28
  const c2x = midX - px * half * 0.28
  const c2y = midY - py * half * 0.28

  return `
    M ${s1x} ${s1y}
    Q ${c1x} ${c1y} ${e1x} ${e1y}
    L ${e2x} ${e2y}
    Q ${c2x} ${c2y} ${s2x} ${s2y}
    Z
  `
}

function GlowBlob({
  size,
  color,
  opacity = 1,
}: {
  size: number
  color: string
  opacity?: number
}) {
  const id = useMemo(
    () => `grad-${color.replace(/[^a-zA-Z0-9]/g, "")}-${size}-${Math.round(opacity * 1000)}`,
    [color, opacity, size],
  )

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={StyleSheet.absoluteFillObject}>
      <Defs>
        <SvgRadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity={0.96 * opacity} />
          <Stop offset="28%" stopColor={color} stopOpacity={0.68 * opacity} />
          <Stop offset="58%" stopColor={color} stopOpacity={0.24 * opacity} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </SvgRadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  )
}

function CenterSymbol() {
  return (
    <View style={styles.centerSymbolRing}>
      <MaterialCommunityIcons name="shield-lock-outline" size={34} color="#FFFFFF" />
    </View>
  )
}

function SatelliteOrb({
  action,
  index,
  slot,
  reducedMotion,
}: {
  action: VaultHeroOrbAction
  index: number
  slot: { angle: number; distance: number }
  reducedMotion: boolean
}) {
  const palette = ORB_THEMES[action.icon]
  const { x, y } = getOrbOffset(slot.angle, slot.distance)

  const appear = useSharedValue(reducedMotion ? 1 : 0)
  const press = useSharedValue(0)
  const orbitFloat = useSharedValue(0)
  const blobDriftX = useSharedValue(0)
  const blobDriftY = useSharedValue(0)
  const blobPulse = useSharedValue(0)
  const introRotate = useSharedValue(reducedMotion ? 0 : -0.52)

  useEffect(() => {
    if (reducedMotion) return

    appear.value = withDelay(
  120 + index * 70,
  withSpring(1, {
    damping: 16,
    stiffness: 125,
    mass: 0.95,
  }),
)

introRotate.value = withDelay(
  80 + index * 70,
  withTiming(0, {
    duration: 980,
    easing: Easing.out(Easing.cubic),
  }),
)

    // each orb gets slightly different loop timing
    orbitFloat.value = withDelay(
      320 + index * 90,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: 2000 + index * 280,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(-1, {
            duration: 1800 + index * 240,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        true,
      ),
    )

    // unique blob X drift
    blobDriftX.value = withDelay(
      480 + index * 110,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: 1800 + index * 350,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(-1, {
            duration: 2100 + index * 270,
            easing: Easing.inOut(Easing.quad),
          }),
        ),
        -1,
        true,
      ),
    )

    // unique blob Y drift
    blobDriftY.value = withDelay(
      620 + index * 90,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: 2400 + index * 230,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(-1, {
            duration: 1900 + index * 310,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        true,
      ),
    )

    // unique pulse timing
    blobPulse.value = withDelay(
      500 + index * 130,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: 1700 + index * 220,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0, {
            duration: 2100 + index * 260,
            easing: Easing.inOut(Easing.sin),
          }),
        ),
        -1,
        true,
      ),
    )
  }, [appear, blobDriftX, blobDriftY, blobPulse, index, orbitFloat, reducedMotion])

  /**
   * Important fix:
   * satelliteWrap is anchored exactly at center using left/top = 50%
   * and then translated by x/y minus half its own size.
   * Do NOT also use margin offsets here or it can visually drift.
   */
const wrapStyle = useAnimatedStyle(() => {
  const arcRotate = introRotate.value * (1 - appear.value * 0.15)

  const rotatedX =
    x * Math.cos(arcRotate) - y * Math.sin(arcRotate)
  const rotatedY =
    x * Math.sin(arcRotate) + y * Math.cos(arcRotate)

  const tx = interpolate(appear.value, [0, 1], [0, rotatedX])
  const ty =
    interpolate(appear.value, [0, 1], [0, rotatedY]) +
    interpolate(orbitFloat.value, [-1, 1], [-3, 3])

  return {
    transform: [
      { translateX: tx - SATELLITE_SIZE / 2 },
      { translateY: ty - SATELLITE_SIZE / 2 },
      { scale: interpolate(appear.value, [0, 1], [0.62, 1]) },
      { scale: interpolate(press.value, [0, 1], [1, 0.95]) },
    ],
    opacity: appear.value,
  }
})

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(blobPulse.value, [0, 1], [0.72, 1]),
    transform: [{ scale: interpolate(blobPulse.value, [0, 1], [0.94, 1.08]) }],
  }))

  const innerBlobStyle = useAnimatedStyle(() => ({
    opacity: interpolate(blobPulse.value, [0, 1], [0.78, 1]),
    transform: [
      { translateX: interpolate(blobDriftX.value, [-1, 1], [-4, 5]) },
      { translateY: interpolate(blobDriftY.value, [-1, 1], [4, -5]) },
      { scale: interpolate(blobPulse.value, [0, 1], [0.84, 1.16]) },
    ],
  }))

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={action.onPress}
      onPressIn={() => {
        press.value = withTiming(1, { duration: 100 })
      }}
      onPressOut={() => {
        press.value = withSpring(0)
      }}
      style={[styles.satelliteWrap, wrapStyle]}
    >
      <AnimatedView style={[styles.satelliteHaloWrap, haloStyle]}>
        <GlowBlob size={96} color={palette.glow} opacity={0.92} />
      </AnimatedView>

      <View style={[styles.satelliteOuterRing, { borderColor: palette.ring, shadowColor: palette.glow }]}>
        <LinearGradient
          colors={["rgba(255,255,255,0.18)", "rgba(255,255,255,0.04)", "rgba(0,0,0,0.18)"]}
          start={{ x: 0.15, y: 0.08 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.satelliteShell}
        >
          <LinearGradient
            colors={[palette.shellTop, palette.shellBottom]}
            start={{ x: 0.18, y: 0.14 }}
            end={{ x: 0.82, y: 1 }}
            style={styles.satelliteCore}
          >
            <View style={styles.satelliteTopHighlight} />
            <AnimatedView style={[styles.satelliteBlobWrap, innerBlobStyle]}>
              <GlowBlob size={48} color={palette.glow} opacity={0.95} />
            </AnimatedView>

            <MaterialCommunityIcons name={ICON_MAP[action.icon]} size={24} color={palette.icon} />
          </LinearGradient>
        </LinearGradient>
      </View>
    </AnimatedPressable>
  )
}

export const VaultHeroOrb: FC<VaultHeroOrbProps> = ({ actions, reducedMotion = false }) => {
  const { themed } = useAppTheme()
  const heroActions = useMemo(() => actions.slice(0, 4), [actions])

  const connectorsIn = useSharedValue(reducedMotion ? 1 : 0)
  const corePulse = useSharedValue(0)
  const coreBlobX = useSharedValue(0)
  const coreBlobY = useSharedValue(0)

  useEffect(() => {
    if (reducedMotion) return

    connectorsIn.value = withTiming(1, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    })

    corePulse.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(0, {
          duration: 2600,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      true,
    )

    coreBlobX.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 2700,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(-1, {
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      true,
    )

    coreBlobY.value = withRepeat(
      withSequence(
        withTiming(1, {
          duration: 2300,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(-1, {
          duration: 2900,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
      true,
    )
  }, [connectorsIn, coreBlobX, coreBlobY, corePulse, reducedMotion])

  const connectorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(connectorsIn.value, [0, 1], [0, 1]),
    transform: [{ scale: interpolate(connectorsIn.value, [0, 1], [0.92, 1]) }],
  }))

  const centerPulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(corePulse.value, [0, 1], [0.985, 1.025]) }],
  }))

  const centerBlobStyle = useAnimatedStyle(() => ({
    opacity: interpolate(corePulse.value, [0, 1], [0.74, 1]),
    transform: [
      { translateX: interpolate(coreBlobX.value, [-1, 1], [-8, 8]) },
      { translateY: interpolate(coreBlobY.value, [-1, 1], [6, -7]) },
      { scale: interpolate(corePulse.value, [0, 1], [0.88, 1.14]) },
    ],
  }))

  const connectorThickness = 12

  return (
    <View style={[styles.root, themed?.(($ => $ as any) as any)]}>
      <View style={styles.canvas}>
        <AnimatedView style={[styles.connectorLayer, connectorStyle]}>
          <Svg width={CANVAS_SIZE} height={CANVAS_SIZE} viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}>
            <Defs>
  <SvgRadialGradient id="connectorBody" cx="50%" cy="45%" r="85%">
    <Stop offset="0%" stopColor="rgba(41, 31, 31, 0.13)" />
    <Stop offset="38%" stopColor="rgba(32, 44, 96, 0.22)" />
    <Stop offset="100%" stopColor="rgba(20, 35, 77, 0.06)" />
  </SvgRadialGradient>

  <SvgRadialGradient id="connectorHighlight" cx="50%" cy="30%" r="75%">
    <Stop offset="0%" stopColor="rgba(110, 19, 19, 0.2)" />
    <Stop offset="35%" stopColor="rgba(36, 19, 19, 0.08)" />
    <Stop offset="100%" stopColor="rgba(60, 26, 26, 0)" />
  </SvgRadialGradient>
</Defs>

{heroActions.map((action, index) => {
  const slot = SLOT_LAYOUT[index] ?? SLOT_LAYOUT[0]
  const { x, y } = getOrbOffset(slot.angle, slot.distance)

  const bodyPath = getCurvedConnectorPath(
    x,
    y,
    CENTER_RADIUS - 8,
    SATELLITE_RADIUS - 6,
    12,
    index === 0 ? 4 : index === 1 ? -4 : index === 2 ? -4 : 4,
  )

  const innerHighlightPath = getCurvedConnectorPath(
    x,
    y,
    CENTER_RADIUS - 10,
    SATELLITE_RADIUS - 8,
    6,
    index === 0 ? 3 : index === 1 ? -3 : index === 2 ? -3 : 3,
  )

  return (
    <React.Fragment key={`connector-${action.id}`}>
      <Path
        d={bodyPath}
        fill="url(#connectorBody)"
        stroke="rgba(74, 58, 58, 0.14)"
        strokeWidth={0.65}
        transform={`translate(${CANVAS_SIZE / 2}, ${CANVAS_SIZE / 2})`}
      />
      <Path
        d={innerHighlightPath}
        fill="url(#connectorHighlight)"
        opacity={0.72}
        transform={`translate(${CANVAS_SIZE / 2}, ${CANVAS_SIZE / 2})`}
      />
    </React.Fragment>
  )
})}
          </Svg>
        </AnimatedView>

        <AnimatedView style={[styles.centerWrap, centerPulseStyle]}>
          <View style={styles.centerOuterGlow}>
            <GlowBlob size={162} color="#95A5FF" opacity={0.45} />
          </View>

          <LinearGradient
            colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0.06)", "rgba(0,0,0,0.2)"]}
            start={{ x: 0.12, y: 0.06 }}
            end={{ x: 0.88, y: 1 }}
            style={styles.centerShell}
          >
            <LinearGradient
              colors={["#7D8BC7", "#5162A4", "#25356D"]}
              start={{ x: 0.18, y: 0.12 }}
              end={{ x: 0.82, y: 1 }}
              style={styles.centerCore}
            >
              <View style={styles.centerTopHighlight} />
              <AnimatedView style={[styles.centerBlobWrap, centerBlobStyle]}>
                <GlowBlob size={86} color="#DCE3FF" opacity={0.88} />
              </AnimatedView>
              <CenterSymbol />
            </LinearGradient>
          </LinearGradient>
        </AnimatedView>

        {heroActions.map((action, index) => (
          <SatelliteOrb
            key={action.id}
            action={action}
            index={index}
            slot={SLOT_LAYOUT[index] ?? SLOT_LAYOUT[0]}
            reducedMotion={reducedMotion}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  canvas: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },

  connectorLayer: {
    position: "absolute",
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },

  centerWrap: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },

  centerOuterGlow: {
    position: "absolute",
    width: 162,
    height: 162,
    opacity: 0.72,
  },

  centerShell: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    padding: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#8F9DFF",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },

  centerCore: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2C376B",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },

  centerTopHighlight: {
    position: "absolute",
    top: 7,
    left: 10,
    right: 10,
    height: 40,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    backgroundColor: "rgba(255,255,255,0.26)",
  },

  centerBlobWrap: {
    position: "absolute",
    width: 66,
    height: 66,
  },

  centerSymbolRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.82)",
    backgroundColor: "rgba(10,12,22,0.16)",
  },

  satelliteWrap: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: SATELLITE_SIZE,
    height: SATELLITE_SIZE,
    zIndex: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  satelliteHaloWrap: {
    position: "absolute",
    width: 96,
    height: 96,
  },

  satelliteOuterRing: {
    width: SATELLITE_SIZE,
    height: SATELLITE_SIZE,
    borderRadius: SATELLITE_RADIUS,
    borderWidth: 1,
    overflow: "hidden",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },

  satelliteShell: {
    flex: 1,
    borderRadius: 999,
    padding: 2.5,
  },

  satelliteCore: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },

  satelliteTopHighlight: {
    position: "absolute",
    top: 6,
    left: 7,
    right: 7,
    height: 18,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
  },

  satelliteBlobWrap: {
    position: "absolute",
    width: 48,
    height: 48,
  },
})
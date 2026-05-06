import React, { FC, MutableRefObject, useEffect, useMemo, useRef, useState } from "react"
import { Platform, Pressable, StyleSheet, Vibration, View } from "react-native"
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler"
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import { LinearGradient } from "expo-linear-gradient"
import Svg, {
  Circle,
  Defs,
  Path,
  Pattern,
  RadialGradient as SvgRadialGradient,
  Rect,
  Stop,
} from "react-native-svg"
import { MaterialCommunityIcons } from "@expo/vector-icons"

type VaultHeroOrbAction = {
  id: string
  label: string
  onPress: () => void
  icon: "note" | "image" | "pdf" | "file" | "voice"
}

type VaultHeroOrbProps = {
  actions: VaultHeroOrbAction[]
  reducedMotion?: boolean
  onOrbitDragStateChange?: (isDragging: boolean) => void
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)
const AnimatedView = Animated.createAnimatedComponent(View)
const AnimatedPath = Animated.createAnimatedComponent(Path)

const CANVAS_SIZE = 320
const CENTER_SIZE = 114
const SATELLITE_SIZE = 90

const CENTER_RADIUS = CENTER_SIZE / 2
const SATELLITE_RADIUS = SATELLITE_SIZE / 2

const DRAG_ROTATION_MULTIPLIER = 1
const RELEASE_VELOCITY_MULTIPLIER = 1.15
const ROTATION_DECELERATION = 0.992
const DRAG_TOUCH_SCALE = 1.03

const SLOT_LAYOUT = [
  { angle: -90, distance: 122 },
  { angle: -18, distance: 122 },
  { angle: 54, distance: 122 },
  { angle: 126, distance: 122 },
  { angle: 198, distance: 122 },
] as const

const CONNECTOR_BENDS = [4, -4, 4, -4, 0] as const
const INNER_CONNECTOR_BENDS = [3, -3, 3, -3, 0] as const

const ICON_MAP = {
  note: "pencil-outline",
  image: "image-outline",
  pdf: "file-pdf-box",
  file: "file-outline",
  voice: "microphone-outline",
} as const

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
    shellTop: "#c55cf6",
    shellBottom: "#3B1D7A",
    glow: "#C4B5FD",
    glowSoft: "rgba(196,181,253,0.22)",
    icon: "#F5F3FF",
    ring: "rgba(160,140,255,0.18)",
    halo: "rgba(140,120,255,0.22)",
  },
  voice: {
    shellTop: "#FF7ACF",
    shellBottom: "#C2188B",
    glow: "#edbfe2",
    glowSoft: "rgb(182, 94, 151)",
    icon: "#FFF0FA",
    ring: "rgba(107, 60, 91, 0.18)",
    halo: "rgba(81, 36, 65, 0.91)",
  },
  image: {
    shellTop: "#FF7ACF",
    shellBottom: "#a122d3",
    glow: "#edbfe2",
    glowSoft: "rgb(86, 47, 89)",
    icon: "#fff0fa",
    ring: "rgba(222, 35, 160, 0.18)",
    halo: "rgba(101, 43, 81, 0.91)",
  },
  pdf: {
    shellTop: "#8B5CF6",
    shellBottom: "#3B1D7A",
    glow: "#C4B5FD",
    glowSoft: "rgba(196,181,253,0.22)",
    icon: "#F5F3FF",
    ring: "rgba(160,140,255,0.18)",
    halo: "rgba(140,120,255,0.22)",
  },
  file: {
    shellTop: "#FF7ACF",
    shellBottom: "#930cfa",
    glow: "#edbfe2",
    glowSoft: "rgb(86, 47, 89)",
    icon: "#fff0fa",
    ring: "rgba(222, 35, 160, 0.18)",
    halo: "rgba(101, 43, 81, 0.91)",
  },
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180
}

function clamp(value: number, min: number, max: number) {
  "worklet"
  return Math.max(min, Math.min(max, value))
}

function normalizeAngleDelta(delta: number) {
  "worklet"
  if (delta > Math.PI) return delta - Math.PI * 2
  if (delta < -Math.PI) return delta + Math.PI * 2
  return delta
}

function getOrbOffset(angle: number, distance: number) {
  const r = degToRad(angle)
  return {
    x: Math.cos(r) * distance,
    y: Math.sin(r) * distance,
  }
}

function getConnectorCenterPoints(
  x: number,
  y: number,
  centerRadius: number,
  satelliteRadius: number,
  bend = 4,
) {
  const angle = Math.atan2(y, x)
  const nx = Math.cos(angle)
  const ny = Math.sin(angle)
  const px = -ny
  const py = nx

  const startX = nx * centerRadius
  const startY = ny * centerRadius
  const endX = x - nx * satelliteRadius
  const endY = y - ny * satelliteRadius

  return {
    startX,
    startY,
    controlX: (startX + endX) / 2 + px * bend,
    controlY: (startY + endY) / 2 + py * bend,
    endX,
    endY,
  }
}

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

  const { startX, startY, controlX, controlY, endX, endY } = getConnectorCenterPoints(
    x,
    y,
    centerRadius,
    satelliteRadius,
    bend,
  )

  const s1x = startX + px * half
  const s1y = startY + py * half
  const s2x = startX - px * half
  const s2y = startY - py * half

  const e1x = endX + px * half
  const e1y = endY + py * half
  const e2x = endX - px * half
  const e2y = endY - py * half

  const c1x = controlX + px * half * 0.28
  const c1y = controlY + py * half * 0.28
  const c2x = controlX - px * half * 0.28
  const c2y = controlY - py * half * 0.28

  return `
    M ${s1x} ${s1y}
    Q ${c1x} ${c1y} ${e1x} ${e1y}
    L ${e2x} ${e2y}
    Q ${c2x} ${c2y} ${s2x} ${s2y}
    Z
  `
}

function getConnectorStrokePath(
  x: number,
  y: number,
  centerRadius: number,
  satelliteRadius: number,
  bend = 4,
) {
  const { startX, startY, controlX, controlY, endX, endY } = getConnectorCenterPoints(
    x,
    y,
    centerRadius,
    satelliteRadius,
    bend,
  )

  return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`
}

function estimateQuadraticCurveLength(
  x: number,
  y: number,
  centerRadius: number,
  satelliteRadius: number,
  bend = 4,
) {
  const { startX, startY, controlX, controlY, endX, endY } = getConnectorCenterPoints(
    x,
    y,
    centerRadius,
    satelliteRadius,
    bend,
  )

  let length = 0
  let previousX = startX
  let previousY = startY

  for (let step = 1; step <= 12; step += 1) {
    const t = step / 12
    const invT = 1 - t
    const nextX = invT * invT * startX + 2 * invT * t * controlX + t * t * endX
    const nextY = invT * invT * startY + 2 * invT * t * controlY + t * t * endY
    length += Math.hypot(nextX - previousX, nextY - previousY)
    previousX = nextX
    previousY = nextY
  }

  return length
}

function triggerOrbHaptic() {
  if (Platform.OS === "android") {
    Vibration.vibrate(8)
  }
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

function HeroDotField() {
  const patternId = useMemo(() => `vault-hero-grid-${Math.random().toString(36).slice(2, 10)}`, [])

  return (
    <Svg width={CANVAS_SIZE} height={CANVAS_SIZE} viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}>
      <Defs>
        <Pattern id={patternId} patternUnits="userSpaceOnUse" width="18" height="18">
          <Circle cx="9" cy="9" r="0.85" fill="rgba(246, 228, 255, 0.22)" />
        </Pattern>
      </Defs>
      <Rect x="0" y="0" width={CANVAS_SIZE} height={CANVAS_SIZE} fill={`url(#${patternId})`} opacity={0.68} />
    </Svg>
  )
}

function CenterSymbol() {
  return (
    <View style={styles.centerSymbolRing}>
      <MaterialCommunityIcons name="lock" size={34} color="#FFFFFF" />
    </View>
  )
}

function AuroraBlob({
  size,
  color,
  opacity,
  baseX,
  baseY,
  driftXRange,
  driftYRange,
  parallaxShiftX,
  parallaxShiftY,
  scaleRange = [0.96, 1.06],
  delay = 0,
  duration = 22000,
  reducedMotion,
  parallaxX,
  parallaxY,
}: {
  size: number
  color: string
  opacity: number
  baseX: number
  baseY: number
  driftXRange: [number, number]
  driftYRange: [number, number]
  parallaxShiftX: [number, number]
  parallaxShiftY: [number, number]
  scaleRange?: [number, number]
  delay?: number
  duration?: number
  reducedMotion: boolean
  parallaxX: SharedValue<number>
  parallaxY: SharedValue<number>
}) {
  const driftX = useSharedValue(0)
  const driftY = useSharedValue(0)
  const breathe = useSharedValue(reducedMotion ? 0.4 : 0)

  useEffect(() => {
    if (reducedMotion) return

    driftX.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
          withTiming(-1, { duration: duration + 3600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    )

    driftY.value = withDelay(
      delay + 1200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: duration + 4200, easing: Easing.inOut(Easing.quad) }),
          withTiming(-1, { duration: duration - 1800, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    )

    breathe.value = withDelay(
      delay + 300,
      withRepeat(
        withSequence(
          withTiming(1, { duration: duration - 3000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: duration - 1200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    )
  }, [breathe, delay, driftX, driftY, duration, reducedMotion])

  const style = useAnimatedStyle(() => ({
    opacity,
    transform: [
      { translateX: baseX + interpolate(driftX.value, [-1, 1], driftXRange) + interpolate(parallaxX.value, [-1, 1], parallaxShiftX) },
      { translateY: baseY + interpolate(driftY.value, [-1, 1], driftYRange) + interpolate(parallaxY.value, [-1, 1], parallaxShiftY) },
      { scale: interpolate(breathe.value, [0, 1], scaleRange) },
    ],
  }))

  return (
    <AnimatedView
      pointerEvents="none"
      style={[
        styles.auroraBlob,
        {
          width: size,
          height: size,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        },
        style,
      ]}
    >
      <GlowBlob size={size} color={color} opacity={1} />
    </AnimatedView>
  )
}

function ConnectorPulse({
  index,
  path,
  pathLength,
  reducedMotion,
  transform,
}: {
  index: number
  path: string
  pathLength: number
  reducedMotion: boolean
  transform: string
}) {
  const pulse = useSharedValue(reducedMotion ? 0.52 : 0)
  const dashLength = 15 + index * 1.5
  const dashGap = pathLength + 42

  useEffect(() => {
    if (reducedMotion) return
    pulse.value = withDelay(
      index * 360,
      withRepeat(
        withTiming(1, {
          duration: 4800 + index * 320,
          easing: Easing.linear,
        }),
        -1,
        false,
      ),
    )
  }, [index, pulse, reducedMotion])

  const wideAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(pulse.value, [0, 1], [pathLength + 24, -28]),
    opacity: interpolate(pulse.value, [0, 1], [0.04, 0.16]),
  }))

  const coreAnimatedProps = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(pulse.value, [0, 1], [pathLength + 18, -20]),
    opacity: interpolate(pulse.value, [0, 1], [0.08, 0.34]),
  }))

  return (
    <>
      <AnimatedPath
        d={path}
        animatedProps={wideAnimatedProps}
        fill="none"
        stroke="rgba(247, 224, 255, 0.18)"
        strokeWidth={4.8}
        strokeLinecap="round"
        strokeDasharray={`${dashLength * 1.8} ${dashGap}`}
        transform={transform}
      />
      <AnimatedPath
        d={path}
        animatedProps={coreAnimatedProps}
        fill="none"
        stroke={index === 2 ? "rgba(255, 240, 170, 0.24)" : "rgba(255, 236, 255, 0.28)"}
        strokeWidth={1.35}
        strokeLinecap="round"
        strokeDasharray={`${dashLength} ${dashGap}`}
        transform={transform}
      />
    </>
  )
}

function SatelliteOrb({
  action,
  index,
  slot,
  reducedMotion,
  orbitRotation,
  isOrbitDraggingRef,
}: {
  action: VaultHeroOrbAction
  index: number
  slot: { angle: number; distance: number }
  reducedMotion: boolean
  orbitRotation: SharedValue<number>
  isOrbitDraggingRef: MutableRefObject<boolean>
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

  const iconUprightStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-orbitRotation.value}rad` }],
  }))

  const highlightUprightStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-orbitRotation.value}rad` }],
  }))

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
  }, [appear, blobDriftX, blobDriftY, blobPulse, index, orbitFloat, reducedMotion, introRotate])

  const wrapStyle = useAnimatedStyle(() => {
    const arcRotate = introRotate.value * (1 - appear.value * 0.15)
    const rotatedX = x * Math.cos(arcRotate) - y * Math.sin(arcRotate)
    const rotatedY = x * Math.sin(arcRotate) + y * Math.cos(arcRotate)

    const tx = interpolate(appear.value, [0, 1], [0, rotatedX])
    const ty = interpolate(appear.value, [0, 1], [0, rotatedY])

    return {
      transform: [
        { translateX: tx - SATELLITE_SIZE / 2 },
        { translateY: ty - SATELLITE_SIZE / 2 
          // + interpolate(orbitFloat.value, [-1, 1], [1.5, -1.5])

         },
        { scale: interpolate(appear.value, [0, 1], [0.62, 1]) },
        { scale: interpolate(press.value, [-0.14, 0, 1], [1.01, 1, 0.95]) },
      ],
      opacity: appear.value,
    }
  })

  const haloStyle = useAnimatedStyle(() => ({
    opacity: interpolate(blobPulse.value, [0, 1], [0.72, 1]) * interpolate(press.value, [0, 1], [1, 1.18]),
    transform: [
      { scale: interpolate(blobPulse.value, [0, 1], [0.94, 1.08]) },
      { scale: interpolate(press.value, [0, 1], [1, 1.06]) },
    ],
  }))

  const innerBlobStyle = useAnimatedStyle(() => ({
    opacity: interpolate(blobPulse.value, [0, 1], [0.78, 1]),
    transform: [
      { translateX: interpolate(blobDriftX.value, [-1, 1], [-4, 5]) },
      { translateY: interpolate(blobDriftY.value, [-1, 1], [4, -5]) },
      { scale: interpolate(blobPulse.value, [0, 1], [0.84, 1.16]) },
    ],
  }))

  const shellPressStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: interpolate(press.value, [-0.14, 0, 1], [1.006, 1, 0.992]) },
      { scaleY: interpolate(press.value, [-0.14, 0, 1], [1.004, 1, 0.982]) },
    ],
  }))

  const pressGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(press.value, [-0.14, 0, 1], [0.24, 0.14, 0.3]),
    transform: [{ scale: interpolate(press.value, [-0.14, 0, 1], [1.04, 0.98, 1.08]) }],
  }))

  const handlePressIn = () => {
    if (isOrbitDraggingRef.current) return
    press.value = withTiming(1, { duration: 100 })
  }

  const handlePressOut = () => {
    press.value = withSequence(
      withTiming(-0.12, { duration: 120, easing: Easing.out(Easing.quad) }),
      withSpring(0, {
        damping: 15,
        stiffness: 190,
        mass: 0.9,
      }),
    )
  }

  const handlePress = () => {
    if (isOrbitDraggingRef.current) return
    triggerOrbHaptic()
    action.onPress()
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.satelliteWrap, wrapStyle]}
    >
      <AnimatedView pointerEvents="none" style={[styles.satellitePressGlow, pressGlowStyle]}>
        <GlowBlob size={104} color={palette.glow} opacity={0.78} />
      </AnimatedView>

      <AnimatedView style={[styles.satelliteHaloWrap, haloStyle]}>
        <GlowBlob size={96} color={palette.glow} opacity={0.92} />
      </AnimatedView>

      <AnimatedView style={shellPressStyle}>
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
              <AnimatedView pointerEvents="none" style={[styles.satelliteHighlightOverlay, highlightUprightStyle]}>
                <View style={styles.satelliteTopHighlight} />
              </AnimatedView>

              <AnimatedView style={[styles.satelliteBlobWrap, innerBlobStyle]}>
                <GlowBlob size={70} color={palette.glow} opacity={0.95} />
              </AnimatedView>

              <AnimatedView style={iconUprightStyle}>
                <MaterialCommunityIcons name={ICON_MAP[action.icon]} size={34} color={palette.icon} />
              </AnimatedView>
            </LinearGradient>
          </LinearGradient>
        </View>
      </AnimatedView>
    </AnimatedPressable>
  )
}

export const VaultHeroOrb: FC<VaultHeroOrbProps> = ({
  actions,
  reducedMotion = false,
  onOrbitDragStateChange,
}) => {
  const canvasRef = useRef<View>(null)
  const isOrbitDraggingRef = useRef(false)
  const [canvasCenter, setCanvasCenter] = useState({ x: 0, y: 0 })

  const heroActions = useMemo(() => actions.slice(0, 5), [actions])

  const connectorsIn = useSharedValue(reducedMotion ? 1 : 0)
  const corePulse = useSharedValue(0)
  const coreBlobX = useSharedValue(0)
  const coreBlobY = useSharedValue(0)
  const orbitRotation = useSharedValue(0)
  const orbitTouchScale = useSharedValue(1)
  const lastTouchAngle = useSharedValue(0)
  const lastTouchTime = useSharedValue(0)
  const angularVelocity = useSharedValue(0)
  const parallaxX = useSharedValue(0)
  const parallaxY = useSharedValue(0)

  const notifyOrbitDragState = (isDragging: boolean) => {
    isOrbitDraggingRef.current = isDragging
    onOrbitDragStateChange?.(isDragging)
  }

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

  const onCanvasLayout = () => {
    requestAnimationFrame(() => {
      canvasRef.current?.measureInWindow((x, y, width, height) => {
        setCanvasCenter({
          x: x + width / 2,
          y: y + height / 2,
        })
      })
    })
  }

  const updateParallax = (absoluteX: number, absoluteY: number) => {
    "worklet"
    const normalizedX = clamp((absoluteX - canvasCenter.x) / (CANVAS_SIZE * 0.5), -1, 1)
    const normalizedY = clamp((absoluteY - canvasCenter.y) / (CANVAS_SIZE * 0.5), -1, 1)
    parallaxX.value = withTiming(normalizedX, {
      duration: 140,
      easing: Easing.out(Easing.quad),
    })
    parallaxY.value = withTiming(normalizedY, {
      duration: 140,
      easing: Easing.out(Easing.quad),
    })
  }

  const connectorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(connectorsIn.value, [0, 1], [0, 1]),
    transform: [{ scale: interpolate(connectorsIn.value, [0, 1], [0.92, 1]) }],
  }))

  const backgroundGridStyle = useAnimatedStyle(() => ({
    opacity: 0.42,
    transform: [
      { translateX: interpolate(parallaxX.value, [-1, 1], [-2.4, 2.4]) },
      { translateY: interpolate(parallaxY.value, [-1, 1], [-1.8, 1.8]) },
    ],
  }))

  const orbitLayerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(parallaxX.value, [-1, 1], [-1.2, 1.2]) },
      { translateY: interpolate(parallaxY.value, [-1, 1], [-1, 1]) },
      { rotate: `${orbitRotation.value}rad` },
      { scale: orbitTouchScale.value },
    ],
  }))

  const centerPulseStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(parallaxX.value, [-1, 1], [-0.8, 0.8]) },
      { translateY: interpolate(parallaxY.value, [-1, 1], [-0.6, 0.6]) },
      { scale: interpolate(corePulse.value, [0, 1], [0.985, 1.025]) },
    ],
  }))

  const centerBlobStyle = useAnimatedStyle(() => ({
    opacity: interpolate(corePulse.value, [0, 1], [0.74, 1]),
    transform: [
      { translateX: interpolate(coreBlobX.value, [-1, 1], [-8, 8]) },
      { translateY: interpolate(coreBlobY.value, [-1, 1], [6, -7]) },
      { scale: interpolate(corePulse.value, [0, 1], [0.88, 1.14]) },
    ],
  }))

  const orbitPanGesture = Gesture.Pan()
    .minDistance(3)
    .shouldCancelWhenOutside(false)
    .onBegin((event) => {
      cancelAnimation(orbitRotation)
      orbitTouchScale.value = withTiming(DRAG_TOUCH_SCALE, { duration: 120 })
      runOnJS(notifyOrbitDragState)(true)

      const dx = event.absoluteX - canvasCenter.x
      const dy = event.absoluteY - canvasCenter.y

      updateParallax(event.absoluteX, event.absoluteY)

      lastTouchAngle.value = Math.atan2(dy, dx)
      lastTouchTime.value = Date.now()
      angularVelocity.value = 0
    })
    .onUpdate((event) => {
      const dx = event.absoluteX - canvasCenter.x
      const dy = event.absoluteY - canvasCenter.y
      const currentAngle = Math.atan2(dy, dx)

      updateParallax(event.absoluteX, event.absoluteY)

      const delta = normalizeAngleDelta(currentAngle - lastTouchAngle.value)
      if (!Number.isFinite(delta)) return

      orbitRotation.value += delta * DRAG_ROTATION_MULTIPLIER

      const now = Date.now()
      const dt = Math.max((now - lastTouchTime.value) / 1000, 0.001)
      const nextVelocity = (delta / dt) * DRAG_ROTATION_MULTIPLIER

      if (Number.isFinite(nextVelocity)) {
        angularVelocity.value = nextVelocity
      }

      lastTouchAngle.value = currentAngle
      lastTouchTime.value = now
    })
    .onEnd(() => {
      orbitTouchScale.value = withTiming(1, { duration: 180 })
      parallaxX.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) })
      parallaxY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) })
      runOnJS(notifyOrbitDragState)(false)

      if (Number.isFinite(angularVelocity.value)) {
        orbitRotation.value = withDecay({
          velocity: angularVelocity.value * RELEASE_VELOCITY_MULTIPLIER,
          deceleration: ROTATION_DECELERATION,
        })
      }
    })
    .onFinalize(() => {
      orbitTouchScale.value = withTiming(1, { duration: 180 })
      parallaxX.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) })
      parallaxY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) })
      runOnJS(notifyOrbitDragState)(false)
    })

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <View style={styles.root}>
        <GestureDetector gesture={orbitPanGesture}>
          <View ref={canvasRef} style={styles.canvas} onLayout={onCanvasLayout} collapsable={false}>
            <AnimatedView pointerEvents="none" style={[styles.heroDotField, backgroundGridStyle]}>
              <HeroDotField />
            </AnimatedView>

            <View pointerEvents="none" style={styles.auroraLayer}>
              <AuroraBlob
                size={304}
                color="#7C3AED"
                opacity={0.18}
                baseX={-92}
                baseY={-84}
                driftXRange={[-12, 16]}
                driftYRange={[8, -10]}
                parallaxShiftX={[-7, 7]}
                parallaxShiftY={[-5, 5]}
                scaleRange={[0.98, 1.06]}
                duration={28000}
                delay={300}
                reducedMotion={reducedMotion}
                parallaxX={parallaxX}
                parallaxY={parallaxY}
              />
              <AuroraBlob
                size={276}
                color="#FF4DC4"
                opacity={0.16}
                baseX={86}
                baseY={-22}
                driftXRange={[10, -14]}
                driftYRange={[-10, 14]}
                parallaxShiftX={[-8, 8]}
                parallaxShiftY={[-6, 6]}
                scaleRange={[0.96, 1.05]}
                duration={24000}
                delay={1200}
                reducedMotion={reducedMotion}
                parallaxX={parallaxX}
                parallaxY={parallaxY}
              />
              <AuroraBlob
                size={214}
                color="#FFE65B"
                opacity={0.07}
                baseX={16}
                baseY={88}
                driftXRange={[-8, 10]}
                driftYRange={[10, -8]}
                parallaxShiftX={[-6, 6]}
                parallaxShiftY={[-5, 5]}
                scaleRange={[0.98, 1.03]}
                duration={32000}
                delay={2200}
                reducedMotion={reducedMotion}
                parallaxX={parallaxX}
                parallaxY={parallaxY}
              />
            </View>

            <AnimatedView pointerEvents="box-none" style={[styles.orbitLayer, orbitLayerStyle]}>
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
                      CONNECTOR_BENDS[index] ?? 0,
                    )

                    const innerHighlightPath = getCurvedConnectorPath(
                      x,
                      y,
                      CENTER_RADIUS - 10,
                      SATELLITE_RADIUS - 8,
                      6,
                      INNER_CONNECTOR_BENDS[index] ?? 0,
                    )

                    const pulsePath = getConnectorStrokePath(
                      x,
                      y,
                      CENTER_RADIUS - 10,
                      SATELLITE_RADIUS - 8,
                      INNER_CONNECTOR_BENDS[index] ?? 0,
                    )

                    const pulseLength = estimateQuadraticCurveLength(
                      x,
                      y,
                      CENTER_RADIUS - 10,
                      SATELLITE_RADIUS - 8,
                      INNER_CONNECTOR_BENDS[index] ?? 0,
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
                        <ConnectorPulse
                          index={index}
                          path={pulsePath}
                          pathLength={pulseLength}
                          reducedMotion={reducedMotion}
                          transform={`translate(${CANVAS_SIZE / 2}, ${CANVAS_SIZE / 2})`}
                        />
                      </React.Fragment>
                    )
                  })}
                </Svg>
              </AnimatedView>

              {heroActions.map((action, index) => (
                <SatelliteOrb
                  key={action.id}
                  action={action}
                  index={index}
                  slot={SLOT_LAYOUT[index] ?? SLOT_LAYOUT[0]}
                  reducedMotion={reducedMotion}
                  orbitRotation={orbitRotation}
                  isOrbitDraggingRef={isOrbitDraggingRef}
                />
              ))}
            </AnimatedView>

            <AnimatedView style={[styles.centerWrap, centerPulseStyle]}>
              <View style={styles.centerOuterGlow}>
                <GlowBlob size={162} color="#95A5FF" opacity={0.45} />
              </View>

              <LinearGradient
                colors={["rgba(255,255,255,0.22)", "rgba(255, 255, 255, 0.06)", "rgba(169, 162, 172, 0.2)"]}
                start={{ x: 0.12, y: 0.06 }}
                end={{ x: 0.88, y: 1 }}
                style={styles.centerShell}
              >
                <LinearGradient
                  colors={["#d650be", "#7a3c92", "#8320b9"]}
                  start={{ x: 0.18, y: 0.12 }}
                  end={{ x: 0.82, y: 1 }}
                  style={styles.centerCore}
                >
                  <View
                    style={[
                      styles.centerTopHighlight,
                      {
                        transform: [{ rotate: "-15deg" }, { translateX: -2 }],
                      },
                    ]}
                  />
                  <AnimatedView style={[styles.centerBlobWrap, centerBlobStyle]}>
                    <GlowBlob size={86} color="#fadcff" opacity={0.88} />
                  </AnimatedView>
                  <CenterSymbol />
                </LinearGradient>
              </LinearGradient>
            </AnimatedView>
          </View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  root: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  canvas: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  heroDotField: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 0,
  },
  auroraLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  auroraBlob: {
    position: "absolute",
    left: "50%",
    top: "50%",
    marginLeft: -152,
    marginTop: -152,
  },
  orbitLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 8,
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
    backgroundColor: "#66297e",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  centerTopHighlight: {
    position: "absolute",
    top: 4,
    left: 10,
    right: 30,
    height: 20,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
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
    borderWidth: 0,
    borderColor: "rgba(255,255,255,0.82)",
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
  satellitePressGlow: {
    position: "absolute",
    width: 104,
    height: 104,
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
    backgroundColor: "rgba(255,255,255,0.04)",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  satelliteShell: {
    flex: 1,
    borderRadius: SATELLITE_RADIUS,
    padding: 3,
  },
  satelliteCore: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  satelliteHighlightOverlay: {
  ...StyleSheet.absoluteFillObject,
  alignItems: "stretch",
  justifyContent: "flex-start",
},

  satelliteTopHighlight: {
    position: "absolute",
    top: 0,
    left: 7,
    right: 30,
    height: 15,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
      transform: [{ rotate: "-15deg" }, { translateX: -2 }],

  },
  satelliteBlobWrap: {
    position: "absolute",
    width: 70,
    height: 70,
  },
})

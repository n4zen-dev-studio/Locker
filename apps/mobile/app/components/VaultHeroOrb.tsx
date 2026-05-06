import React, { FC, MutableRefObject, useEffect, useMemo, useRef } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Vibration,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import Svg, {
  Circle,
  Defs,
  Path,
  Pattern,
  RadialGradient as SvgRadialGradient,
  Rect,
  Stop,
  RadialGradient,
} from "react-native-svg";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/context";
import { ThemedStyle } from "@/theme/types";

type VaultHeroOrbAction = {
  id: string;
  label: string;
  onPress: () => void;
  icon: "note" | "image" | "pdf" | "file" | "voice";
};

type VaultHeroOrbProps = {
  actions: VaultHeroOrbAction[];
  reducedMotion?: boolean;
  active?: boolean;
  onOrbitDragStateChange?: (isDragging: boolean) => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedView = Animated.createAnimatedComponent(View);

const CANVAS_SIZE = 320;
const CENTER_SIZE = 114;
const SATELLITE_SIZE = 90;

const CENTER_RADIUS = CENTER_SIZE / 2;
const SATELLITE_RADIUS = SATELLITE_SIZE / 2;

const CORE_SIZE = 152;
const INNER_CORE_SIZE = 120;

const SLOT_LAYOUT = [
  { angle: -90, distance: 122 },
  { angle: -18, distance: 122 },
  { angle: 54, distance: 122 },
  { angle: 126, distance: 122 },
  { angle: 198, distance: 122 },
] as const;

const CONNECTOR_BENDS = [4, -4, 4, -4, 0] as const;
const INNER_CONNECTOR_BENDS = [3, -3, 3, -3, 0] as const;

const ICON_MAP = {
  note: "pencil-outline",
  image: "image-outline",
  pdf: "file-pdf-box",
  file: "file-outline",
  voice: "microphone-outline",
} as const;

const ORB_THEMES: Record<
  VaultHeroOrbAction["icon"],
  {
    shellTop: string;
    shellBottom: string;
    glow: string;
    glowSoft: string;
    icon: string;
    ring: string;
    halo: string;
  }
> = {
  note: {
    shellTop: "#FF4DBA",
    shellBottom: "#050209",
    glow: "#FFF7FD",
    glowSoft: "#FF9ADB",
    icon: "#FFF0FA",
    ring: "rgba(136, 110, 126, 0.82)",
    halo: "rgba(81, 36, 65, 0.91)",
  },
  voice: {
    // shellTop: "#FF7ACF",
    // shellBottom: "#C2188B",
    // glow: "#edbfe2",
    // glowSoft: "rgb(182, 94, 151)",
    // icon: "#FFF0FA",
    // ring: "rgba(107, 60, 91, 0.18)",
    // halo: "rgba(81, 36, 65, 0.91)",
    shellTop: "#FF4DBA",
    shellBottom: "#050209",
    glow: "#ffffff",
    glowSoft: "#FF9ADB",
    icon: "#FFF0FA",
    ring: "rgba(136, 110, 126, 0.82)",
    halo: "rgba(81, 36, 65, 0.91)",

    // vaultAccentPink: "#FF4DBA",
    // vaultAccentPinkSoft: "#FF9ADB",
    // vaultGlow: "rgba(255, 77, 186, 0.28)",
    // vaultGlow2: "rgba(77, 193, 255, 0.28))",
    // vaultGlow3: "rgba(255, 219, 77, 0.28))",
    // vaultRing: "rgba(255, 77, 186, 0.82)",
    // vaultBorderSubtle: "rgba(255, 255, 255, 0.08)",
    // vaultSurface: "rgba(17, 11, 23, 0.72)",
    // vaultError: "#FF7A9E",
  },
  image: {
    shellTop: "#FF4DBA",
    shellBottom: "#050209",
    glow: "#FFF7FD",
    glowSoft: "#FF9ADB",
    icon: "#FFF0FA",
    ring: "rgba(136, 110, 126, 0.82)",
    halo: "rgba(81, 36, 65, 0.91)",
  },
  pdf: {
    shellTop: "#FF4DBA",
    shellBottom: "#050209",
    glow: "#FFF7FD",
    glowSoft: "#FF9ADB",
    icon: "#FFF0FA",
    ring: "rgba(136, 110, 126, 0.82)",
    halo: "rgba(81, 36, 65, 0.91)",
  },
  file: {
    shellTop: "#FF4DBA",
    shellBottom: "#050209",
    glow: "#FFF7FD",
    glowSoft: "#FF9ADB",
    icon: "#FFF0FA",
    ring: "rgba(136, 110, 126, 0.82)",
    halo: "rgba(81, 36, 65, 0.91)",
  },
};

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function getOrbOffset(angle: number, distance: number) {
  const r = degToRad(angle);
  return {
    x: Math.cos(r) * distance,
    y: Math.sin(r) * distance,
  };
}

function getConnectorCenterPoints(
  x: number,
  y: number,
  centerRadius: number,
  satelliteRadius: number,
  bend = 4,
) {
  const angle = Math.atan2(y, x);
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const px = -ny;
  const py = nx;

  const startX = nx * centerRadius;
  const startY = ny * centerRadius;
  const endX = x - nx * satelliteRadius;
  const endY = y - ny * satelliteRadius;

  return {
    startX,
    startY,
    controlX: (startX + endX) / 2 + px * bend,
    controlY: (startY + endY) / 2 + py * bend,
    endX,
    endY,
  };
}

function getCurvedConnectorPath(
  x: number,
  y: number,
  centerRadius: number,
  satelliteRadius: number,
  thickness: number,
  bend = 4,
) {
  const angle = Math.atan2(y, x);
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  const px = -ny;
  const py = nx;
  const half = thickness / 2;

  const { startX, startY, controlX, controlY, endX, endY } =
    getConnectorCenterPoints(x, y, centerRadius, satelliteRadius, bend);

  const s1x = startX + px * half;
  const s1y = startY + py * half;
  const s2x = startX - px * half;
  const s2y = startY - py * half;

  const e1x = endX + px * half;
  const e1y = endY + py * half;
  const e2x = endX - px * half;
  const e2y = endY - py * half;

  const c1x = controlX + px * half * 0.28;
  const c1y = controlY + py * half * 0.28;
  const c2x = controlX - px * half * 0.28;
  const c2y = controlY - py * half * 0.28;

  return `
    M ${s1x} ${s1y}
    Q ${c1x} ${c1y} ${e1x} ${e1y}
    L ${e2x} ${e2y}
    Q ${c2x} ${c2y} ${s2x} ${s2y}
    Z
  `;
}

function triggerOrbHaptic() {
  if (Platform.OS === "android") {
    Vibration.vibrate(8);
  }
}

function GlowBlob({
  size,
  color,
  opacity = 1,
}: {
  size: number;
  color: string;
  opacity?: number;
}) {
  const id = useMemo(
    () =>
      `grad-${color.replace(/[^a-zA-Z0-9]/g, "")}-${size}-${Math.round(opacity * 1000)}`,
    [color, opacity, size],
  );

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={StyleSheet.absoluteFillObject}
    >
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
  );
}

function HeroDotField() {
  const patternId = useMemo(
    () => `vault-hero-grid-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  return (
    <Svg
      width={CANVAS_SIZE}
      height={CANVAS_SIZE}
      viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
    >
      <Defs>
        <Pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width="18"
          height="18"
        >
          <Circle cx="9" cy="9" r="0.85" fill="rgba(246, 228, 255, 0.22)" />
        </Pattern>
      </Defs>
      <Rect
        x="0"
        y="0"
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        fill={`url(#${patternId})`}
        opacity={0.68}
      />
    </Svg>
  );
}

function CenterSymbol() {
  return (
    <View style={styles.centerSymbolRing}>
      <MaterialCommunityIcons name="lock" size={34} color="#FFFFFF" />
    </View>
  );
}

function SatelliteOrb({
  action,
  index,
  slot,
  reducedMotion,
  orbitRotation,
  isOrbitDraggingRef,
}: {
  action: VaultHeroOrbAction;
  index: number;
  slot: { angle: number; distance: number };
  reducedMotion: boolean;
  orbitRotation: SharedValue<number>;
  isOrbitDraggingRef: MutableRefObject<boolean>;
}) {
  const palette = ORB_THEMES[action.icon];
  const { x, y } = getOrbOffset(slot.angle, slot.distance);

  const appear = useSharedValue(reducedMotion ? 1 : 0);
  const press = useSharedValue(0);
  const introRotate = useSharedValue(reducedMotion ? 0 : -0.52);

  const iconUprightStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-orbitRotation.value}rad` }],
  }));

  const highlightUprightStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-orbitRotation.value}rad` }],
  }));

  useEffect(() => {
    if (reducedMotion) return;

    appear.value = withDelay(
      40 + index * 25,
      withTiming(1, {
        duration: 320,
        easing: Easing.out(Easing.cubic),
      }),
    );

    introRotate.value = withDelay(
      30 + index * 25,
      withTiming(0, {
        duration: 340,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [appear, index, reducedMotion, introRotate]);

  const wrapStyle = useAnimatedStyle(() => {
    const arcRotate = introRotate.value * (1 - appear.value * 0.15);
    const rotatedX = x * Math.cos(arcRotate) - y * Math.sin(arcRotate);
    const rotatedY = x * Math.sin(arcRotate) + y * Math.cos(arcRotate);

    const tx = interpolate(appear.value, [0, 1], [0, rotatedX]);
    const ty = interpolate(appear.value, [0, 1], [0, rotatedY]);

    return {
      transform: [
        { translateX: tx - SATELLITE_SIZE / 2 },
        { translateY: ty - SATELLITE_SIZE / 2 },
        { scale: interpolate(appear.value, [0, 1], [0.62, 1]) },
        { scale: interpolate(press.value, [-0.14, 0, 1], [1.01, 1, 0.95]) },
      ],
      opacity: appear.value,
    };
  });

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.78 * interpolate(press.value, [0, 1], [1, 1.12]),
    transform: [{ scale: interpolate(press.value, [0, 1], [1, 1.06]) }],
  }));

  const shellPressStyle = useAnimatedStyle(() => ({
    transform: [
      { scaleX: interpolate(press.value, [-0.14, 0, 1], [1.006, 1, 0.992]) },
      { scaleY: interpolate(press.value, [-0.14, 0, 1], [1.004, 1, 0.982]) },
    ],
  }));

  const pressGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(press.value, [-0.14, 0, 1], [0.24, 0.14, 0.3]),
    transform: [
      { scale: interpolate(press.value, [-0.14, 0, 1], [1.04, 0.98, 1.08]) },
    ],
  }));

  const handlePressIn = () => {
    if (isOrbitDraggingRef.current) return;
    press.value = withTiming(1, { duration: 100 });
  };

  const handlePressOut = () => {
    press.value = withSequence(
      withTiming(-0.12, { duration: 120, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) }),
    );
  };

  const handlePress = () => {
    if (isOrbitDraggingRef.current) return;
    triggerOrbHaptic();
    action.onPress();
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.satelliteWrap, wrapStyle]}
    >
      <AnimatedView
        pointerEvents="none"
        style={[styles.satellitePressGlow, pressGlowStyle]}
      >
        <GlowBlob size={104} color={palette.glow} opacity={0.78} />
      </AnimatedView>

      <AnimatedView style={[styles.satelliteHaloWrap, haloStyle]}>
        <GlowBlob size={96} color={palette.glow} opacity={0.8} />
      </AnimatedView>

      <AnimatedView style={shellPressStyle}>
        <View
          style={[
            styles.satelliteOuterRing,
            { borderColor: palette.ring, shadowColor: palette.glow },
          ]}
        >
          <LinearGradient
            colors={[
              "rgba(241, 241, 241, 0.5)",
              "rgba(255, 255, 255, 0.003)",
              "rgba(0, 0, 0, 0.12)",
            ]}
            start={{ x: 0.15, y: 0.08 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.satelliteShell}
          >
            </LinearGradient>
            <LinearGradient
              colors={[palette.shellTop, palette.shellBottom]}
              start={{ x: 0.28, y: 0.40 }}
              end={{ x: 0.72, y: 1 }}
              style={styles.satelliteCore}
            >
              <AnimatedView
                pointerEvents="none"
                style={[
                  styles.satelliteHighlightOverlay,
                  highlightUprightStyle,
                ]}
              >
                <View style={styles.satelliteTopHighlight} />
              </AnimatedView>

              {/* <View style={styles.satelliteBlobWrap}>
                <GlowBlob size={70} color={palette.glow} opacity={0.3} />
              </View> */}

              <AnimatedView style={iconUprightStyle}>
                <MaterialCommunityIcons
                  name={ICON_MAP[action.icon]}
                  size={34}
                  color={palette.icon}
                />
              </AnimatedView>
            </LinearGradient>
          
        </View>
      </AnimatedView>
    </AnimatedPressable>
  );
}

function useStableGradientId(prefix: string) {
  return useMemo(
    () => `${prefix}-${Math.random().toString(36).slice(2, 10)}`,
    [prefix],
  );
}

export const VaultHeroOrb: FC<VaultHeroOrbProps> = ({
  actions,
  reducedMotion = true,
}) => {
  const isOrbitDraggingRef = useRef(false);
  const { theme, themed } = useAppTheme();

  const heroActions = useMemo(() => actions.slice(0, 5), [actions]);

  const connectorsIn = useSharedValue(reducedMotion ? 1 : 0);
  const orbitRotation = useSharedValue(0);

  const coreGradientId = useStableGradientId("vault-core");
  const bloomGradientId = useStableGradientId("vault-bloom");

  useEffect(() => {
    if (reducedMotion) return;

    connectorsIn.value = withTiming(1, {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
  }, [connectorsIn, reducedMotion]);

  const connectorStyle = useAnimatedStyle(() => ({
    opacity: interpolate(connectorsIn.value, [0, 1], [0, 1]),
    transform: [{ scale: interpolate(connectorsIn.value, [0, 1], [0.92, 1]) }],
  }));

  const orbitLayerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${orbitRotation.value}rad` }],
  }));

  return (
    <View style={styles.root}>
      <View style={styles.canvas} collapsable={false}>
        <View pointerEvents="none" style={styles.heroDotField}>
          <HeroDotField />
        </View>

        <AnimatedView
          pointerEvents="box-none"
          style={[styles.orbitLayer, orbitLayerStyle]}
        >
          <AnimatedView style={[styles.connectorLayer, connectorStyle]}>
            <Svg
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
            >
              <Defs>
                <SvgRadialGradient id="connectorBody" cx="50%" cy="45%" r="85%">
                  <Stop offset="0%" stopColor="rgba(41, 31, 31, 0.13)" />
                  <Stop offset="38%" stopColor="rgba(32, 44, 96, 0.22)" />
                  <Stop offset="100%" stopColor="rgba(20, 35, 77, 0.06)" />
                </SvgRadialGradient>

                <SvgRadialGradient
                  id="connectorHighlight"
                  cx="50%"
                  cy="30%"
                  r="75%"
                >
                  <Stop offset="0%" stopColor="rgba(105, 19, 110, 0.2)" />
                  <Stop offset="35%" stopColor="rgba(36, 19, 19, 0.08)" />
                  <Stop offset="100%" stopColor="rgba(60, 26, 26, 0)" />
                </SvgRadialGradient>
              </Defs>

              {heroActions.map((action, index) => {
                const slot = SLOT_LAYOUT[index] ?? SLOT_LAYOUT[0];
                const { x, y } = getOrbOffset(slot.angle, slot.distance);

                const bodyPath = getCurvedConnectorPath(
                  x,
                  y,
                  CENTER_RADIUS - 8,
                  SATELLITE_RADIUS - 6,
                  12,
                  CONNECTOR_BENDS[index] ?? 0,
                );

                const innerHighlightPath = getCurvedConnectorPath(
                  x,
                  y,
                  CENTER_RADIUS - 10,
                  SATELLITE_RADIUS - 8,
                  6,
                  INNER_CONNECTOR_BENDS[index] ?? 0,
                );

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
                );
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

        <View style={themed($coreWrap)}>
          <Svg
            width={CORE_SIZE}
            height={CORE_SIZE}
            viewBox={`0 0 ${CORE_SIZE} ${CORE_SIZE}`}
            style={themed($coreGlowSvg)}
          >
            <Defs>
              <RadialGradient
                id={bloomGradientId}
                cx="50%"
                cy="50%"
                rx="50%"
                ry="50%"
              >
                <Stop
                  offset="0%"
                  stopColor={theme.colors.vault.vaultAccentPinkSoft}
                  stopOpacity="0.52"
                />
                <Stop
                  offset="42%"
                  stopColor={theme.colors.vault.vaultGlow}
                  stopOpacity="0.28"
                />
                <Stop
                  offset="100%"
                  stopColor={theme.colors.vault.vaultGlow}
                  stopOpacity="0"
                />
              </RadialGradient>
              <RadialGradient
                id={coreGradientId}
                cx="50%"
                cy="45%"
                rx="52%"
                ry="52%"
              >
                <Stop
                  offset="0%"
                  stopColor={theme.colors.vault.vaultAccentPinkSoft}
                  stopOpacity="0.92"
                />
                <Stop
                  offset="34%"
                  stopColor={theme.colors.vault.vaultAccentPink}
                  stopOpacity="0.74"
                />
                <Stop
                  offset="72%"
                  stopColor={theme.colors.vault.vaultGlow}
                  stopOpacity="0.34"
                />
                <Stop
                  offset="100%"
                  stopColor={theme.colors.vault.vaultSurface}
                  stopOpacity="0.06"
                />
              </RadialGradient>
            </Defs>
            <Rect
              width={CORE_SIZE}
              height={CORE_SIZE}
              rx={CORE_SIZE / 2}
              fill={`url(#${bloomGradientId})`}
            />
          </Svg>

          <View style={themed($centerCore)}>
            <Svg
              width={INNER_CORE_SIZE}
              height={INNER_CORE_SIZE}
              viewBox={`0 0 ${INNER_CORE_SIZE} ${INNER_CORE_SIZE}`}
            >
              <Defs>
                <RadialGradient
                  id={coreGradientId + "-inner"}
                  cx="50%"
                  cy="42%"
                  rx="50%"
                  ry="50%"
                >
                  <Stop
                    offset="0%"
                    stopColor={theme.colors.vault.vaultAccentPinkSoft}
                    stopOpacity="0.96"
                  />
                  <Stop
                    offset="28%"
                    stopColor={theme.colors.vault.vaultAccentPink}
                    stopOpacity="0.82"
                  />
                  <Stop
                    offset="72%"
                    stopColor={theme.colors.vault.vaultGlow}
                    stopOpacity="0.22"
                  />
                  <Stop
                    offset="100%"
                    stopColor={theme.colors.vault.vaultSurface}
                    stopOpacity="0.1"
                  />
                </RadialGradient>
              </Defs>
              <Rect
                width={INNER_CORE_SIZE}
                height={INNER_CORE_SIZE}
                rx={INNER_CORE_SIZE / 2}
                fill={`url(#${coreGradientId + "-inner"})`}
              />
            </Svg>

            <View style={themed($iconWrap)}>
              <CenterSymbol />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
    opacity: 0.42,
    zIndex: 0,
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
    backgroundColor: "rgba(253, 251, 251, 0.01)",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 8 },
    // elevation: 3,
  },
  satelliteShell: {
    flex: 1,
    borderRadius: SATELLITE_RADIUS,
    // padding: 1.5,
     zIndex: 1,
  ...StyleSheet.absoluteFillObject,
    opacity: 0.7
  },
  satelliteCore: {
    flex: 1,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 0,
  ...StyleSheet.absoluteFillObject, 
  margin: 2,
  opacity: 0.98

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
});

const $coreWrap: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  width: CORE_SIZE,
  height: CORE_SIZE,
  alignItems: "center",
  justifyContent: "center",
});

const $coreGlowSvg: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
});

const $centerCore: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: INNER_CORE_SIZE,
  height: INNER_CORE_SIZE,
  borderRadius: CORE_SIZE / 2,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.vault.vaultSurface,
  borderWidth: 1,
  borderColor: colors.vault.vaultBorderSubtle,
  shadowColor: colors.vault.vaultAccentPink,
  shadowOpacity: 0.24,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 0 },
  elevation: 3,
});

const $iconWrap: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  alignItems: "center",
  justifyContent: "center",
});

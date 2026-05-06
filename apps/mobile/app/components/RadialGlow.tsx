import { Svg, Defs, RadialGradient, Rect, Stop } from "react-native-svg"
import { StyleSheet } from 'react-native';

export const KeyRadialGlow = ({ color = "#ffffff" }) => {
  return (
    <Svg
      style={[StyleSheet.absoluteFillObject, {overflow: 'visible'}]}
      width="90%"
      height="90%"
    >
      <Defs>
        <RadialGradient id="grad" cx="50%" cy="60%" r="50%">
          <Stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <Stop offset="40%" stopColor={color} stopOpacity="0.15" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>

      <Rect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
    </Svg>
  )
}
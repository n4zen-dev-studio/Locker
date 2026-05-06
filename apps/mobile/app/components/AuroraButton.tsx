import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withRepeat, 
  withTiming, 
  interpolate,
  withSequence
} from 'react-native-reanimated';

interface AuroraButtonProps {
  onPress?: () => void;
  title?: string;
  style?: ViewStyle;
}

const AuroraButton = ({ onPress, title = "Get Started", style }: AuroraButtonProps) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Infinite loop for the blob movement
    progress.value = withRepeat(
      withTiming(1, { duration: 4000 }),
      -1,
      true
    );
  }, []);

  const animatedBlobStyle = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 1], [-20, 20]);
    const scale = interpolate(progress.value, [0, 0.5, 1], [1, 1.2, 1]);
    
    return {
      transform: [{ translateX }, { scale }],
    };
  });

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[styles.container, style]}>
      {/* The Outer Black Border/Frame */}
      <View style={styles.buttonFrame}>
        
        {/* The Animated Gradient Background */}
        <View style={styles.gradientContainer}>
          <Animated.View style={[styles.blobLayer, animatedBlobStyle]}>
            <LinearGradient
              colors={['#4facfe', '#8e2de2', '#f000ff', '#7300ff']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          
          {/* Subtle overlay to soften the blobs */}
          <LinearGradient
            colors={['rgba(0,0,0,0.2)', 'transparent', 'rgba(115, 0, 255, 0.3)']}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Inner Glow Border */}
        <View style={styles.innerGlow} />

        <Text style={styles.buttonText}>{title}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 100,
    padding: 4, // Space for the thick outer dark ring
    backgroundColor: '#000',
    shadowColor: "#7300ff",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  buttonFrame: {
    width: 280,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden', // Clips the animated blobs
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  gradientContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  blobLayer: {
    position: 'absolute',
    width: '150%',
    height: '150%',
    top: '-25%',
    left: '-25%',
    opacity: 0.8,
  },
  innerGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '500',
    letterSpacing: -0.5,
    zIndex: 10,
  },
});

export default AuroraButton;
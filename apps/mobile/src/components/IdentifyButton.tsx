import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { spacing, type as typography, useAppTheme } from '../theme/theme';

const SIZE = 168;
const STAGE = SIZE * 1.7;
/** Stacked translucent discs approximate a soft radial glow (no blur in React Native). */
const HALOS = [1.6, 1.42, 1.26, 1.12];

interface Props {
  mode: 'ready' | 'listening' | 'processing' | 'busy';
  label: string;
  onPress: () => void;
}

/**
 * The one big action: a gradient (blue → purple → pink) disc with a microphone. While
 * listening, gradient rings ripple outwards; while processing, a spinner replaces the mic.
 */
export function IdentifyButton({ mode, label, onPress }: Props) {
  const { colors } = useAppTheme();
  const ripple = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode !== 'listening') {
      ripple.stopAnimation();
      ripple.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(ripple, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [mode, ripple]);

  // Two rings, half a cycle apart.
  const ring = (offset: number) => {
    const t = Animated.modulo(Animated.add(ripple, offset), 1);
    return {
      transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
      opacity: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }),
    };
  };

  // Only the "ready" state accepts taps; listening/processing are stopped via Cancel.
  const disabled = mode !== 'ready';
  const working = mode === 'processing' || mode === 'busy';

  return (
    <View style={styles.wrapper}>
      <View style={styles.stage}>
        {HALOS.map((scale) => (
          <View
            key={scale}
            pointerEvents="none"
            style={[
              styles.halo,
              {
                width: SIZE * scale,
                height: SIZE * scale,
                borderRadius: (SIZE * scale) / 2,
                backgroundColor: colors.glow,
              },
            ]}
          />
        ))}
        {mode === 'listening'
          ? [0, 0.5].map((offset) => (
              <Animated.View key={offset} pointerEvents="none" style={[styles.ring, ring(offset)]}>
                <LinearGradient
                  colors={colors.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.ringFill}
                />
              </Animated.View>
            ))
          : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled, busy: mode !== 'ready' }}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => [
            styles.button,
            { opacity: working ? 0.7 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
          ]}
          testID="identify-button"
        >
          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.disc}
          >
            {working ? (
              <ActivityIndicator color={colors.background} size="large" />
            ) : (
              <MaterialIcons
                name={mode === 'listening' ? 'graphic-eq' : 'mic'}
                size={64}
                color={colors.background}
              />
            )}
          </LinearGradient>
        </Pressable>
      </View>
      {/* While busy the screen heading already says "Listening…"/"Identifying…"; the label stays
          available to screen readers via accessibilityLabel. */}
      {mode === 'ready' ? (
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  stage: {
    width: STAGE,
    height: STAGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: { position: 'absolute' },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
  },
  ringFill: { flex: 1 },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    shadowColor: '#AD72FF',
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  disc: {
    flex: 1,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...typography.headline, marginTop: spacing.xs, textAlign: 'center' },
});

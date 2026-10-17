import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme/theme';

const SIZE = 200;

interface Props {
  mode: 'ready' | 'listening' | 'processing' | 'busy';
  label: string;
  onPress: () => void;
}

/** Large circular "Tap to identify" button with a pulsing ring while listening. */
export function IdentifyButton({ mode, label, onPress }: Props) {
  const { colors } = useAppTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode !== 'listening') {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [mode, pulse]);

  const ringStyle = {
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
  };
  // Only the "ready" state accepts taps; listening/processing are stopped via Cancel.
  const disabled = mode !== 'ready';
  const dimmed = mode === 'processing' || mode === 'busy';

  return (
    <View style={styles.wrapper}>
      {mode === 'listening' ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.ring, { backgroundColor: colors.pulse }, ringStyle]}
        />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, busy: mode !== 'ready' }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.primary, opacity: dimmed ? 0.75 : pressed ? 0.85 : 1 },
        ]}
        testID="identify-button"
      >
        {mode === 'processing' || mode === 'busy' ? (
          <ActivityIndicator color={colors.primaryText} size="large" />
        ) : null}
        <Text style={[styles.label, { color: colors.primaryText }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: SIZE * 1.5,
    height: SIZE * 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  label: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
});

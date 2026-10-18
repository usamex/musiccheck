import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { useAppTheme } from '../theme/theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface Props extends Omit<PressableProps, 'children' | 'style'> {
  icon: IconName;
  accessibilityLabel: string;
  color?: string;
}

/**
 * Round 40 px icon button (header actions). Inset from the screen edge on every platform so
 * it never sits flush against the edge (FINDINGS F-024). `ref` (a regular prop in React 19)
 * is forwarded through `rest`, so it works with `<Link asChild>`.
 */
export function IconButton({ icon, color, ...rest }: Props) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      {...rest}
      // After the spread: `<Link asChild>` injects its own style on web, which would drop the inset.
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? colors.surfaceHigh : 'transparent' },
      ]}
    >
      <MaterialIcons name={icon} size={24} color={color ?? colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
});

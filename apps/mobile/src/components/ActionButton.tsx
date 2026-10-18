import { MaterialIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { radius, spacing, type as typography, useAppTheme } from '../theme/theme';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface Props {
  title: string;
  onPress: () => void;
  /** primary = filled accent pill, secondary = tonal pill, danger = tonal pill with error text. */
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  /** Stretch to the parent's width. */
  block?: boolean;
  testID?: string;
}

/** Material 3 style pill button in the app's dark palette. */
export function ActionButton({
  title,
  onPress,
  variant = 'secondary',
  icon,
  disabled,
  block,
  testID,
}: Props) {
  const { colors } = useAppTheme();
  const bg = variant === 'primary' ? colors.primary : colors.surfaceHigh;
  const fg =
    variant === 'primary' ? colors.primaryText : variant === 'danger' ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        block ? styles.block : null,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.82 : 1 },
      ]}
    >
      {icon ? <MaterialIcons name={icon} size={18} color={fg} /> : null}
      <Text style={[styles.text, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  block: { alignSelf: 'stretch' },
  text: { ...typography.label, fontSize: 15 },
});

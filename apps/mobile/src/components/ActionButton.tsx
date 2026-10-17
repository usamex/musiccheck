import { Pressable, StyleSheet, Text } from 'react-native';

import { radius, spacing, useAppTheme } from '../theme/theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testID?: string;
}

export function ActionButton({ title, onPress, variant = 'secondary', disabled, testID }: Props) {
  const { colors } = useAppTheme();
  const bg = variant === 'primary' ? colors.primary : 'transparent';
  const fg =
    variant === 'primary' ? colors.primaryText : variant === 'danger' ? colors.danger : colors.primary;
  const border = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : colors.border;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <Text style={[styles.text, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
});

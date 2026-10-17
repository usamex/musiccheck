import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useAppTheme } from '../theme/theme';

export default function RootLayout() {
  const { dark, colors } = useAppTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerTintColor: colors.primary, headerTitleStyle: { color: colors.text } }}>
        <Stack.Screen name="index" options={{ title: 'MusicCheck' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen name="result" options={{ title: 'Result' }} />
      </Stack>
    </ThemeProvider>
  );
}

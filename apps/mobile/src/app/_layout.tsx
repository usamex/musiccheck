import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useAppTheme } from '../theme/theme';

export default function RootLayout() {
  const { colors } = useAppTheme();
  const navTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerTintColor: colors.textMuted,
          headerTitleStyle: { color: colors.text, fontWeight: '500', fontSize: 20 },
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'MusicCheck' }} />
        <Stack.Screen name="history" options={{ title: 'History' }} />
        <Stack.Screen name="result" options={{ title: '' }} />
      </Stack>
    </ThemeProvider>
  );
}

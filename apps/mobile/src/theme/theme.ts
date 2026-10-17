import { useColorScheme } from 'react-native';

export interface Palette {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryText: string;
  danger: string;
  success: string;
  pulse: string;
}

export const lightPalette: Palette = {
  background: '#F7F7FA',
  surface: '#FFFFFF',
  text: '#111118',
  textMuted: '#5C5F6B',
  border: '#E1E2E8',
  primary: '#3B5BFD',
  primaryText: '#FFFFFF',
  danger: '#C62828',
  success: '#1E8E3E',
  pulse: 'rgba(59, 91, 253, 0.25)',
};

export const darkPalette: Palette = {
  background: '#0E0F13',
  surface: '#1A1C22',
  text: '#F2F3F7',
  textMuted: '#A0A3AE',
  border: '#2C2F38',
  primary: '#6E86FF',
  primaryText: '#0E0F13',
  danger: '#FF6B6B',
  success: '#4CC26E',
  pulse: 'rgba(110, 134, 255, 0.28)',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20 } as const;

export function useAppTheme(): { dark: boolean; colors: Palette } {
  const dark = useColorScheme() === 'dark';
  return { dark, colors: dark ? darkPalette : lightPalette };
}

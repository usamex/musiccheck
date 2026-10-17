/**
 * DEVELOPER TOOLS — rendered only when `__DEV__` is true (see Home screen).
 * "Identify from file…" uploads an existing audio file through the same pipeline with
 * `source=file`. It is a testing aid and does NOT replace the microphone flow.
 */
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getHealth } from '../api/client';
import { getApiBaseUrl } from '../api/config';
import type { PickedAudioFile } from '../recognition/useRecognition';
import { radius, spacing, useAppTheme } from '../theme/theme';
import { ActionButton } from './ActionButton';

interface Props {
  disabled: boolean;
  onFilePicked: (file: PickedAudioFile) => void;
}

export function DevTools({ disabled, onFilePicked }: Props) {
  const { colors } = useAppTheme();
  const [health, setHealth] = useState<string | null>(null);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'video/mp4'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      onFilePicked({ uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? null });
    } catch (e) {
      setHealth(`File picker failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const checkServer = async () => {
    setHealth('Checking…');
    const res = await getHealth();
    setHealth(
      res.ok
        ? `OK: ${res.health.service} ${res.health.version} at ${res.baseUrl}`
        : `Failed (${res.error.kind}${res.error.code ? `/${res.error.code}` : ''}): ${res.error.message ?? ''}`,
    );
  };

  return (
    <View style={[styles.box, { borderColor: colors.border }]} testID="dev-tools">
      <Text style={[styles.heading, { color: colors.textMuted }]}>DEVELOPER TOOLS (dev builds only)</Text>
      <Text style={[styles.small, { color: colors.textMuted }]}>
        API: {getApiBaseUrl() ?? 'EXPO_PUBLIC_API_BASE_URL not set'}
      </Text>
      <View style={styles.row}>
        <ActionButton title="Identify from file…" onPress={pickFile} disabled={disabled} />
        <ActionButton title="Check server" onPress={checkServer} />
      </View>
      {health ? <Text style={[styles.small, { color: colors.textMuted }]}>{health}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    gap: spacing.sm,
    alignSelf: 'stretch',
  },
  heading: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  small: { fontSize: 12 },
  row: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});

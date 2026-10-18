import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ComponentProps, ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { HistoryEntry } from '../history/historyStore';
import {
  formatConfidence,
  formatOffset,
  formatQueryInfo,
  formatScore,
  formatTimestamp,
  providerLabel,
} from '../presentation/copy';
import { radius, spacing, type as typography, useAppTheme } from '../theme/theme';

const ART_SIZE = 232;

type IconName = ComponentProps<typeof MaterialIcons>['name'];

/** Presentational result card (no navigation, no I/O) — render-tested. */
export function ResultView({ entry, showDiagnostics }: { entry: HistoryEntry; showDiagnostics: boolean }) {
  const { colors } = useAppTheme();
  const { response } = entry;
  const { track } = response;
  const provider = providerLabel(response.provider, response.provider_kind);
  const confidence = formatConfidence(response.confidence);
  const offset = formatOffset(response.matched_offset_seconds);
  const score = formatScore(response.score);
  const query = showDiagnostics ? formatQueryInfo(response.query) : null;

  return (
    <View style={styles.container} testID="result-view">
      {track.artwork_url ? (
        <Image
          source={{ uri: track.artwork_url }}
          style={[styles.art, { backgroundColor: colors.surfaceHighest }]}
          accessibilityLabel={`Artwork for ${track.title}`}
          testID="result-artwork"
        />
      ) : (
        <View
          style={[styles.art, { backgroundColor: colors.surfaceHigh }]}
          accessibilityLabel="No artwork available"
          testID="result-artwork-placeholder"
        >
          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.artGradient]}
          />
          <MaterialIcons name="music-note" size={88} color={colors.text} />
        </View>
      )}

      <View style={styles.titles}>
        <Text style={[styles.title, { color: colors.text }]} testID="result-title">
          {track.title}
        </Text>
        <Text style={[styles.artist, { color: colors.textMuted }]} testID="result-artist">
          {track.artist}
        </Text>
        {track.album ? (
          <Text style={[styles.album, { color: colors.textSubtle }]} testID="result-album">
            {track.album}
          </Text>
        ) : null}
      </View>

      {provider ? (
        <View style={[styles.chip, { backgroundColor: colors.primaryContainer }]}>
          <MaterialIcons name="graphic-eq" size={16} color={colors.onPrimaryContainer} />
          <Text
            style={[styles.chipText, { color: colors.onPrimaryContainer }]}
            testID="result-provider"
          >
            {provider}
          </Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        {confidence ? (
          <Row icon="verified" testID="result-confidence">
            Confidence: {confidence}
          </Row>
        ) : null}
        {offset ? (
          <Row icon="timelapse" testID="result-offset">
            {offset}
          </Row>
        ) : null}
        <Row icon="schedule">{formatTimestamp(entry.recognizedAt)}</Row>
        {score ? (
          <Text style={[styles.details, { color: colors.textSubtle }]} testID="result-score">
            Details: {score}
          </Text>
        ) : null}
        {query ? (
          <Text style={[styles.details, { color: colors.textSubtle }]} testID="result-query">
            {query}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Row({ icon, children, testID }: { icon: IconName; children: ReactNode; testID?: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.row}>
      <MaterialIcons name={icon} size={18} color={colors.textSubtle} />
      <Text style={[styles.rowText, { color: colors.textMuted }]} testID={testID}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  art: {
    width: ART_SIZE,
    height: ART_SIZE,
    borderRadius: radius.xl,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  artGradient: { opacity: 0.55 },
  titles: { alignItems: 'center', gap: spacing.xs },
  title: { ...typography.display, fontSize: 28, textAlign: 'center' },
  artist: { fontSize: 18, fontWeight: '500', textAlign: 'center' },
  album: { fontSize: 15, textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  chipText: { ...typography.label },
  card: {
    alignSelf: 'stretch',
    padding: spacing.md + 4,
    borderRadius: radius.lg,
    gap: spacing.sm + 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  rowText: { fontSize: 15, flexShrink: 1 },
  details: { ...typography.caption },
});

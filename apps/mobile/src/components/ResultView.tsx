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
import { radius, spacing, useAppTheme } from '../theme/theme';

const ART_SIZE = 220;

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
          style={[styles.art, { backgroundColor: colors.border }]}
          accessibilityLabel={`Artwork for ${track.title}`}
          testID="result-artwork"
        />
      ) : (
        <View
          style={[styles.art, styles.placeholder, { backgroundColor: colors.border }]}
          accessibilityLabel="No artwork available"
          testID="result-artwork-placeholder"
        >
          <Text style={[styles.placeholderGlyph, { color: colors.textMuted }]}>♪</Text>
        </View>
      )}

      <Text style={[styles.title, { color: colors.text }]} testID="result-title">
        {track.title}
      </Text>
      <Text style={[styles.artist, { color: colors.text }]} testID="result-artist">
        {track.artist}
      </Text>
      {track.album ? (
        <Text style={[styles.album, { color: colors.textMuted }]} testID="result-album">
          {track.album}
        </Text>
      ) : null}

      <View style={[styles.meta, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {provider ? (
          <Text style={[styles.metaLine, { color: colors.text }]} testID="result-provider">
            {provider}
          </Text>
        ) : null}
        {confidence ? (
          <Text style={[styles.metaLine, { color: colors.text }]} testID="result-confidence">
            Confidence: {confidence}
          </Text>
        ) : null}
        {offset ? (
          <Text style={[styles.metaLine, { color: colors.textMuted }]} testID="result-offset">
            {offset}
          </Text>
        ) : null}
        <Text style={[styles.metaLine, { color: colors.textMuted }]}>
          {formatTimestamp(entry.recognizedAt)}
        </Text>
        {score ? (
          <Text style={[styles.details, { color: colors.textMuted }]} testID="result-score">
            Details: {score}
          </Text>
        ) : null}
        {query ? (
          <Text style={[styles.details, { color: colors.textMuted }]} testID="result-query">
            {query}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch' },
  art: { width: ART_SIZE, height: ART_SIZE, borderRadius: radius.lg, marginBottom: spacing.md },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderGlyph: { fontSize: 72 },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  artist: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  album: { fontSize: 15, textAlign: 'center' },
  meta: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  metaLine: { fontSize: 14 },
  details: { fontSize: 12 },
});

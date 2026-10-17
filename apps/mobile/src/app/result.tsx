import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '../components/ActionButton';
import { ResultView } from '../components/ResultView';
import { findResult, type HistoryEntry } from '../history';
import { spacing, useAppTheme } from '../theme/theme';

export default function ResultScreen() {
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : null;
  const [entry, setEntry] = useState<HistoryEntry | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    if (!id) {
      setEntry(null);
      return;
    }
    findResult(id)
      .then((e) => alive && setEntry(e))
      .catch(() => alive && setEntry(null));
    return () => {
      alive = false;
    };
  }, [id]);

  const identifyAnother = () => {
    if (router.canDismiss()) router.dismissTo('/');
    else router.replace('/');
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      {entry === undefined ? (
        <ActivityIndicator />
      ) : entry === null ? (
        <Text style={[styles.missing, { color: colors.textMuted }]}>
          This result is no longer available.
        </Text>
      ) : (
        <ResultView entry={entry} showDiagnostics={__DEV__} />
      )}
      <View style={styles.actions}>
        <ActionButton title="Identify another" variant="primary" onPress={identifyAnother} testID="identify-another" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg, alignItems: 'center' },
  missing: { fontSize: 16, textAlign: 'center', marginTop: spacing.xl },
  actions: { alignSelf: 'stretch' },
});

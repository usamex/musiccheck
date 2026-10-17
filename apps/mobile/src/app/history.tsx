import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { historyStore, type HistoryEntry } from '../history';
import { formatTimestamp } from '../presentation/copy';
import { spacing, useAppTheme } from '../theme/theme';

export default function HistoryScreen() {
  const { colors } = useAppTheme();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      historyStore
        .load()
        .then((e) => alive && setEntries(e))
        .catch(() => alive && setEntries([]));
      return () => {
        alive = false;
      };
    }, []),
  );
  useEffect(() => historyStore.subscribe(setEntries), []);

  const confirmClear = () => {
    Alert.alert('Clear history?', 'This removes all recognized songs from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          historyStore.clear().catch(() => Alert.alert('Could not clear history'));
        },
      },
    ]);
  };

  const hasEntries = !!entries && entries.length > 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerRight: hasEntries
            ? () => (
                <Pressable accessibilityRole="button" onPress={confirmClear} hitSlop={12} testID="clear-history">
                  <Text style={{ color: colors.danger, fontSize: 16, fontWeight: '600' }}>Clear</Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <FlatList
        data={entries ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={!hasEntries ? styles.emptyContainer : undefined}
        ItemSeparatorComponent={() => (
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
        )}
        ListEmptyComponent={
          entries === null ? undefined : (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              Songs you identify will appear here.
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/result', params: { id: item.id } })}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? colors.border : colors.surface },
            ]}
          >
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {item.response.track.title}
            </Text>
            <Text style={[styles.artist, { color: colors.textMuted }]} numberOfLines={1}>
              {item.response.track.artist}
            </Text>
            <Text style={[styles.time, { color: colors.textMuted }]}>
              {formatTimestamp(item.recognizedAt)}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  row: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 2 },
  title: { fontSize: 17, fontWeight: '600' },
  artist: { fontSize: 15 },
  time: { fontSize: 12, marginTop: 2 },
  separator: { height: StyleSheet.hairlineWidth },
  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  empty: { fontSize: 16, textAlign: 'center' },
});

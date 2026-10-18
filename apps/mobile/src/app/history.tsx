import { MaterialIcons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '../components/IconButton';
import { historyStore, type HistoryEntry } from '../history';
import { formatTimestamp } from '../presentation/copy';
import { radius, spacing, type as typography, useAppTheme } from '../theme/theme';

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
                <IconButton
                  icon="delete-outline"
                  accessibilityLabel="Clear history"
                  onPress={confirmClear}
                  testID="clear-history"
                />
              )
            : undefined,
        }}
      />
      <FlatList
        data={entries ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={hasEntries ? styles.list : styles.emptyContainer}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          entries === null ? undefined : (
            <View style={styles.emptyBox}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
                <MaterialIcons name="library-music" size={32} color={colors.textSubtle} />
              </View>
              <Text style={[styles.empty, { color: colors.textMuted }]}>
                Songs you identify will appear here.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/result', params: { id: item.id } })}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: pressed ? colors.surfaceHigh : colors.surface },
            ]}
          >
            <View style={[styles.tile, { backgroundColor: colors.surfaceHigh }]}>
              <LinearGradient
                colors={colors.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, styles.tileGradient]}
              />
              <MaterialIcons name="music-note" size={22} color={colors.text} />
            </View>
            <View style={styles.rowText}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {item.response.track.title}
              </Text>
              <Text style={[styles.artist, { color: colors.textMuted }]} numberOfLines={1}>
                {item.response.track.artist}
              </Text>
              <Text style={[styles.time, { color: colors.textSubtle }]}>
                {formatTimestamp(item.recognizedAt)}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.textSubtle} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  tile: {
    width: 48,
    height: 48,
    borderRadius: radius.md - 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGradient: { opacity: 0.55 },
  rowText: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '500' },
  artist: { fontSize: 14 },
  time: { ...typography.caption, marginTop: 2 },
  separator: { height: spacing.sm },
  emptyContainer: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  emptyBox: { alignItems: 'center', gap: spacing.md },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { ...typography.body, textAlign: 'center' },
});

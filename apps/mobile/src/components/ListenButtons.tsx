import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useListenServices } from '../listen/useListenServices';
import { radius, spacing, type as typography, useAppTheme } from '../theme/theme';

/** "Listen on" buttons (Spotify / YouTube Music / Apple Music) for a recognised track. */
export function ListenButtons({ title, artist }: { title: string; artist: string }) {
  const { colors } = useAppTheme();
  const { services, open } = useListenServices(title, artist);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <View style={styles.section} testID="listen-buttons">
      <Text style={[styles.heading, { color: colors.textSubtle }]}>Listen on</Text>
      <View style={styles.row}>
        {services.map((service) => (
          <Pressable
            key={service.id}
            accessibilityRole="link"
            accessibilityLabel={`Search for ${title} on ${service.name}`}
            onPress={async () => {
              setFailed((await open(service)) ? null : service.name);
            }}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: pressed ? colors.surfaceHighest : colors.surfaceHigh },
            ]}
            testID={`listen-${service.id}`}
          >
            <MaterialCommunityIcons name={service.icon} size={20} color={service.brandColor} />
            <Text style={[styles.label, { color: colors.text }]}>{service.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.note, { color: colors.textSubtle }]}>
        {failed
          ? `Couldn't open ${failed}.`
          : 'Opens a search for this song. It may not be on every service.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.sm },
  heading: { ...typography.label, letterSpacing: 0.4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  label: { ...typography.label, fontSize: 15 },
  note: { ...typography.caption, textAlign: 'center' },
});

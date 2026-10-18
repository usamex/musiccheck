/**
 * Jest-only setup. @expo/vector-icons loads its icon font through expo-asset, which has no asset
 * registry under Jest ("Module … is missing from the asset registry"). Render icons as plain
 * Text placeholders instead; icon appearance is checked visually, not in unit tests.
 */
jest.mock('@expo/vector-icons', () => {
  const { Text } = jest.requireActual('react-native');
  const icon = (set: string) => {
    const Icon = ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{`[${set}:${name}]`}</Text>;
    Icon.displayName = set;
    return Icon;
  };
  return { MaterialIcons: icon('MaterialIcons'), MaterialCommunityIcons: icon('MaterialCommunityIcons') };
});

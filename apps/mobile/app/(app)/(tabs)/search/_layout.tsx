import { Stack } from 'expo-router';
import { useTheme } from '../../../../contexts/theme';

export default function SearchLayout() {
  const { colors } = useTheme();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Search',
          headerLargeTitle: true,
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTintColor: colors.foreground,
        }}
      />
    </Stack>
  );
}

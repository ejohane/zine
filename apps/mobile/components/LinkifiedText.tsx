import { Text, TextStyle, Linking, Alert, StyleProp } from 'react-native';
import * as Haptics from 'expo-haptics';
import { parseTextWithLinks } from '../lib/linkUtils';
import { useTheme } from '../contexts/theme';

interface LinkifiedTextProps {
  text: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export function LinkifiedText({ text, style, numberOfLines }: LinkifiedTextProps) {
  const { colors } = useTheme();
  const segments = parseTextWithLinks(text);

  const handleLinkPress = async (url: string) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open this link');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open link');
    }
  };

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((segment, index) => {
        if (segment.isLink) {
          return (
            <Text
              key={index}
              style={{ color: colors.primary, textDecorationLine: 'underline' }}
              onPress={() => handleLinkPress(segment.text)}
            >
              {segment.text}
            </Text>
          );
        }
        return <Text key={index}>{segment.text}</Text>;
      })}
    </Text>
  );
}

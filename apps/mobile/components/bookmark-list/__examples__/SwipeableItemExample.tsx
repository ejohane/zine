import { View, Text, StyleSheet } from 'react-native';
import SwipeableItem, {
  OpenDirection,
  useSwipeableItemParams,
} from 'react-native-swipeable-item';
import Animated, { useAnimatedStyle, interpolate } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';

interface UnderlayProps {
  direction: 'left' | 'right';
}

function SwipeUnderlay({ direction }: UnderlayProps) {
  const { percentOpen } = useSwipeableItemParams();

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(percentOpen.value, [0, 1], [0, 1]),
  }));

  const backgroundColor = direction === 'right' ? '#EF4444' : '#10B981';
  const iconName = direction === 'right' ? 'trash-2' : 'archive';

  return (
    <Animated.View style={[styles.underlay, { backgroundColor }, animatedStyle]}>
      <Feather name={iconName} size={24} color="white" />
      <Text style={styles.underlayText}>
        {direction === 'right' ? 'Delete' : 'Archive'}
      </Text>
    </Animated.View>
  );
}

const testItem = { id: 'test-1', title: 'Test Bookmark' };

export function SwipeableItemExample() {
  const handleSwipeChange = ({ openDirection, snapPoint }: { openDirection: OpenDirection, snapPoint: number }) => {
    console.log('Swipe changed:', { openDirection, snapPoint });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Swipeable Item Test</Text>
      <Text style={styles.subheader}>
        Swipe left for delete, swipe right for archive
      </Text>

      <SwipeableItem
        key="test-item"
        item={testItem}
        renderUnderlayLeft={() => <SwipeUnderlay direction="left" />}
        renderUnderlayRight={() => <SwipeUnderlay direction="right" />}
        snapPointsLeft={[80]}
        snapPointsRight={[80]}
        onChange={handleSwipeChange}
        swipeEnabled={true}
        activationThreshold={20}
        swipeDamping={10}
      >
        <View style={styles.content}>
          <View style={styles.thumbnail} />
          <View style={styles.textContainer}>
            <Text style={styles.title}>Test Bookmark Title</Text>
            <Text style={styles.subtitle}>Test Creator</Text>
          </View>
        </View>
      </SwipeableItem>

      <Text style={styles.instructions}>
        ✅ If you can see this and swipe the item, the library is configured correctly!
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subheader: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    gap: 12,
  },
  thumbnail: {
    width: 64,
    height: 64,
    backgroundColor: '#ddd',
    borderRadius: 8,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  underlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  underlayText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  instructions: {
    marginTop: 24,
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
    textAlign: 'center',
  },
});

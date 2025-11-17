import { View, Text, StyleSheet, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SwipeableList, SwipeAction } from '../../components/swipeable-list';

interface TestItem {
  id: string;
  title: string;
  subtitle: string;
}

const sampleData: TestItem[] = [
  { id: '1', title: 'First Item', subtitle: 'Swipe left or right to reveal actions' },
  { id: '2', title: 'Second Item', subtitle: 'Try swiping slowly or quickly' },
  { id: '3', title: 'Third Item', subtitle: 'Full swipe triggers the primary action' },
  { id: '4', title: 'Fourth Item', subtitle: 'Only one row can be open at a time' },
  { id: '5', title: 'Fifth Item', subtitle: 'Scrolling closes the open row' },
  { id: '6', title: 'Sixth Item', subtitle: 'Test haptic feedback on iOS' },
  { id: '7', title: 'Seventh Item', subtitle: 'Actions fade and scale as revealed' },
  { id: '8', title: 'Eighth Item', subtitle: 'Tap outside to close' },
];

export default function TestSwipeableListScreen() {
  const getLeftActions = (item: TestItem): SwipeAction[] => [
    {
      key: 'archive',
      label: 'Archive',
      color: '#3b82f6',
      icon: <Feather name="archive" size={20} color="#fff" />,
      onPress: () => {
        Alert.alert('Archive', `Archived: ${item.title}`);
      },
    },
    {
      key: 'pin',
      label: 'Pin',
      color: '#8b5cf6',
      icon: <Feather name="star" size={20} color="#fff" />,
      onPress: () => {
        Alert.alert('Pin', `Pinned: ${item.title}`);
      },
    },
  ];

  const getRightActions = (item: TestItem): SwipeAction[] => [
    {
      key: 'share',
      label: 'Share',
      color: '#10b981',
      icon: <Feather name="share-2" size={20} color="#fff" />,
      onPress: () => {
        Alert.alert('Share', `Shared: ${item.title}`);
      },
    },
    {
      key: 'delete',
      label: 'Delete',
      color: '#ef4444',
      icon: <Feather name="trash-2" size={20} color="#fff" />,
      isPrimary: true,
      onPress: () => {
        Alert.alert('Delete', `Deleted: ${item.title}`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive' },
        ]);
      },
    },
  ];

  const renderItem = ({ item }: { item: TestItem; index: number }) => (
    <View style={styles.itemContainer}>
      <View style={styles.itemContent}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
      </View>
      <Feather name="chevron-right" size={20} color="#9ca3af" />
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Swipeable List Test',
          headerBackTitle: 'Back',
        }}
      />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Swipeable List Demo</Text>
          <Text style={styles.headerSubtitle}>
            Swipe items left or right to reveal actions
          </Text>
        </View>
        <SwipeableList
          data={sampleData}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          getLeftActions={getLeftActions}
          getRightActions={getRightActions}
          enableHaptics={true}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  itemSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
});

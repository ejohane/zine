import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, SafeAreaView } from 'react-native';
import { DesignSystemProvider } from '@zine/design-system/native';
import './global.css';

export default function App() {
  return (
    <DesignSystemProvider>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Zine Mobile App</Text>
          <Text style={styles.subtitle}>With HeroUI Native Provider</Text>
          <Text style={styles.info}>✅ HeroUI Native integration working!</Text>
          <StatusBar style="auto" />
        </View>
      </SafeAreaView>
    </DesignSystemProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 8,
    color: '#666',
  },
  info: {
    fontSize: 14,
    color: '#999',
    marginTop: 10,
  },
});

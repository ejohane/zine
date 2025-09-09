import './global.css';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { View, Text } from 'react-native';
import { DesignSystemProvider, Button } from '@zine/design-system/native';

function MainContent() {
  return (
    <View style={{ flex: 1, backgroundColor: '#fafafa' }}>
      <StatusBar style="dark" />

      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: 'black' }}>
          HeroUI Native Test
        </Text>

        <Text style={{ fontSize: 18, marginBottom: 20, color: '#6B7280' }}>
          Testing HeroUI Native components
        </Text>

        <View style={{ gap: 10 }}>
          <Button color="primary">Primary Button</Button>
          <Button color="secondary">Secondary Button</Button>
          <Button color="success">Success Button</Button>
          <Button color="warning">Warning Button</Button>
          <Button color="danger">Danger Button</Button>
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DesignSystemProvider>
        <MainContent />
      </DesignSystemProvider>
    </SafeAreaProvider>
  );
}
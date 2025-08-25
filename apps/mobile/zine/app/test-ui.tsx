import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { Text, Card, Input, Badge, Button } from '@zine/ui';

export default function TestUIScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-4 space-y-4">
        {/* Typography Examples */}
        <Card variant="elevated">
          <Text variant="h4" className="mb-2">Typography</Text>
          <Text variant="h1" color="primary">Heading 1</Text>
          <Text variant="h2">Heading 2</Text>
          <Text variant="body" color="muted">Body text with muted color</Text>
          <Text variant="caption" color="error">Error caption</Text>
          <Text variant="overline" color="success">SUCCESS OVERLINE</Text>
        </Card>

        {/* Card Examples */}
        <Card variant="outlined">
          <Text variant="h5" className="mb-2">Card Variants</Text>
          <Text variant="body">This is an outlined card</Text>
        </Card>

        <Card variant="filled" pressable onPress={() => console.log('Pressed filled card')}>
          <Text variant="body">This is a pressable filled card - tap me!</Text>
        </Card>

        {/* Form Examples */}
        <Card variant="elevated">
          <Text variant="h5" className="mb-4">Form Components</Text>
          
          <Input
            label="Email Address"
            placeholder="Enter your email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            containerClassName="mb-4"
          />
          
          <Input
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            error={password && password.length < 8 ? "Password must be at least 8 characters" : undefined}
          />
        </Card>

        {/* Badge Examples */}
        <Card variant="elevated">
          <Text variant="h5" className="mb-4">Badges</Text>
          <View className="flex-row flex-wrap gap-2">
            <Badge variant="default" size="sm">Default</Badge>
            <Badge variant="primary" size="md">Primary</Badge>
            <Badge variant="success" size="lg">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="error">Error</Badge>
          </View>
        </Card>

        {/* Button Examples */}
        <Card variant="elevated">
          <Text variant="h5" className="mb-4">Buttons</Text>
          <View className="space-y-2">
            <Button variant="primary" size="lg">Primary Button</Button>
            <Button variant="secondary" size="md">Secondary Button</Button>
            <Button variant="ghost" size="sm">Ghost Button</Button>
            <Button variant="danger">Danger Button</Button>
            <Button variant="outline">Outline Button</Button>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
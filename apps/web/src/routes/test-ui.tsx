import { useState } from 'react';
import { Text, Card, Input, Badge, Button } from '@zine/ui';

export default function TestUIPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Typography Examples */}
        <Card variant="elevated">
          <Text variant="h4" className="mb-4">Typography</Text>
          <div className="space-y-2">
            <Text variant="h1" color="primary">Heading 1</Text>
            <Text variant="h2">Heading 2</Text>
            <Text variant="h3">Heading 3</Text>
            <Text variant="body" color="muted">Body text with muted color</Text>
            <Text variant="caption" color="error">Error caption</Text>
            <Text variant="overline" color="success">SUCCESS OVERLINE</Text>
          </div>
        </Card>

        {/* Card Examples */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card variant="elevated">
            <Text variant="h5" className="mb-2">Elevated Card</Text>
            <Text variant="body">This card has elevation with shadows</Text>
          </Card>

          <Card variant="outlined">
            <Text variant="h5" className="mb-2">Outlined Card</Text>
            <Text variant="body">This card has a border outline</Text>
          </Card>

          <Card variant="filled" pressable onPress={() => alert('Card clicked!')}>
            <Text variant="h5" className="mb-2">Filled Pressable Card</Text>
            <Text variant="body">Click me to see interaction!</Text>
          </Card>
        </div>

        {/* Form Examples */}
        <Card variant="elevated">
          <Text variant="h4" className="mb-6">Form Components</Text>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Email Address"
              placeholder="Enter your email"
              value={email}
              onChangeText={setEmail}
              type="email"
              autoCapitalize="none"
            />
            
            <Input
              label="Password"
              placeholder="Enter your password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              error={password && password.length < 8 ? "Password must be at least 8 characters" : undefined}
            />
          </div>
        </Card>

        {/* Badge Examples */}
        <Card variant="elevated">
          <Text variant="h4" className="mb-4">Badges</Text>
          <div className="flex flex-wrap gap-3">
            <Badge variant="default" size="sm">Default Small</Badge>
            <Badge variant="primary" size="md">Primary Medium</Badge>
            <Badge variant="success" size="lg">Success Large</Badge>
            <Badge variant="warning">Warning Default</Badge>
            <Badge variant="error">Error Default</Badge>
          </div>
        </Card>

        {/* Button Examples */}
        <Card variant="elevated">
          <Text variant="h4" className="mb-4">Buttons</Text>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" size="lg">Primary Large</Button>
            <Button variant="secondary" size="md">Secondary Medium</Button>
            <Button variant="ghost" size="sm">Ghost Small</Button>
            <Button variant="danger">Danger Default</Button>
            <Button variant="outline">Outline Default</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
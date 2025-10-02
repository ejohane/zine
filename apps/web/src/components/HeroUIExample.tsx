import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';

export function HeroUIExample() {
  return (
    <Card className="p-4">
      <CardHeader>
        <h3 className="text-lg font-semibold">UI Components Working!</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <p>This is a test of UI components integration.</p>
        <div className="flex gap-2">
          <Button size="sm">Primary</Button>
          <Button variant="secondary" size="sm">Secondary</Button>
          <Button variant="outline" size="sm">Outline</Button>
        </div>
      </CardContent>
    </Card>
  );
}
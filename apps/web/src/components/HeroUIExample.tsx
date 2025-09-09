import { Button, Card, CardBody, CardHeader } from '@zine/design-system/web';

export function HeroUIExample() {
  return (
    <Card className="p-4">
      <CardHeader>
        <h3 className="text-lg font-semibold">HeroUI Components Working!</h3>
      </CardHeader>
      <CardBody className="space-y-4">
        <p>This is a test of HeroUI components integration.</p>
        <div className="flex gap-2">
          <Button color="primary" size="sm">Primary</Button>
          <Button color="secondary" size="sm">Secondary</Button>
          <Button color="success" size="sm">Success</Button>
        </div>
      </CardBody>
    </Card>
  );
}
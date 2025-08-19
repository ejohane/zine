import type { Meta, StoryObj } from '@storybook/react';
import { PageFromBottom } from './PageFromBottom';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { Card } from '../Card';
import { useState } from 'react';
import { cn } from '../../../lib/utils';
import { 
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  MapPin,
  Clock,
  Package,
  ChevronRight,
  Tag
} from 'lucide-react';

const meta: Meta<typeof PageFromBottom> = {
  title: 'Silk/PageFromBottom',
  component: PageFromBottom,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'A full-page component that slides up from the bottom, perfect for shopping carts, detailed views, and multi-step flows.',
      },
      story: {
        inline: false,
        iframeHeight: 600,
      },
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
      <>
        <div className="p-4">
          <Button onClick={() => setIsOpen(true)}>Open Page</Button>
        </div>
        <PageFromBottom
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          title="Page From Bottom"
          subtitle="Slides up from the bottom"
          onClose={() => setIsOpen(false)}
        >
          <div className="p-4">
            <Card>
              <h3 className="font-semibold mb-2">Content</h3>
              <p className="text-gray-600 dark:text-gray-400">
                This page slides up from the bottom of the screen.
              </p>
            </Card>
          </div>
        </PageFromBottom>
      </>
    );
  },
};

export const ShoppingCartExample: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [quantities, setQuantities] = useState({ item1: 1, item2: 2, item3: 1 });
    
    const updateQuantity = (item: string, delta: number) => {
      setQuantities(prev => ({
        ...prev,
        [item]: Math.max(0, prev[item as keyof typeof prev] + delta)
      }));
    };
    
    return (
      <>
        <div className="p-4">
          <Button onClick={() => setIsOpen(true)}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            View Cart (4 items)
          </Button>
        </div>
        <PageFromBottom
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          title="Shopping Cart"
          subtitle="4 items"
          onClose={() => setIsOpen(false)}
        >
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {[
                { id: 'item1', name: 'Premium Headphones', price: 299.99, image: 'bg-blue-500' },
                { id: 'item2', name: 'Wireless Mouse', price: 49.99, image: 'bg-green-500' },
                { id: 'item3', name: 'USB-C Cable', price: 19.99, image: 'bg-purple-500' },
              ].map((item) => (
                <Card key={item.id} padding="sm">
                  <div className="flex gap-4">
                    <div className={`w-20 h-20 ${item.image} rounded-lg flex-shrink-0`} />
                    <div className="flex-1">
                      <h4 className="font-medium mb-1">{item.name}</h4>
                      <p className="text-lg font-semibold">${item.price}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-8 text-center">
                        {quantities[item.id as keyof typeof quantities]}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ml-2">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
              
              <Card variant="bordered">
                <div className="flex items-center gap-3 mb-3">
                  <Tag className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">Apply Promo Code</span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter code"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
                  />
                  <Button size="sm">Apply</Button>
                </div>
              </Card>
            </div>
            
            <div className="border-t border-gray-200 dark:border-gray-800 p-4 space-y-3">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>$389.97</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tax</span>
                  <span>$31.20</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Shipping</span>
                  <span className="text-green-600">FREE</span>
                </div>
              </div>
              <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                <span>Total</span>
                <span>$421.17</span>
              </div>
              <Button className="w-full">
                <CreditCard className="h-4 w-4 mr-2" />
                Proceed to Checkout
              </Button>
            </div>
          </div>
        </PageFromBottom>
      </>
    );
  },
};

export const DetailView: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    
    return (
      <>
        <div className="p-4 space-y-2">
          {['Order #12345', 'Order #12346', 'Order #12347'].map((order) => (
            <Card
              key={order}
              interactive
              onClick={() => setIsOpen(true)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">{order}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Delivered • Dec 10, 2024
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </div>
            </Card>
          ))}
        </div>
        <PageFromBottom
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          title="Order #12345"
          subtitle="Delivered on Dec 10, 2024"
          onClose={() => setIsOpen(false)}
          headerAction={
            <Badge variant="default" className="bg-green-100 text-green-800">
              Delivered
            </Badge>
          }
        >
          <div className="p-4 space-y-6">
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <Package className="h-5 w-5 text-gray-600" />
                <h3 className="font-semibold">Order Details</h3>
              </div>
              <div className="space-y-4">
                {[
                  { name: 'Premium Headphones', qty: 1, price: '$299.99' },
                  { name: 'Wireless Mouse', qty: 2, price: '$99.98' },
                ].map((item, i) => (
                  <div key={i} className="flex justify-between">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-gray-500">Qty: {item.qty}</p>
                    </div>
                    <span className="font-medium">{item.price}</span>
                  </div>
                ))}
              </div>
            </Card>
            
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <MapPin className="h-5 w-5 text-gray-600" />
                <h3 className="font-semibold">Delivery Address</h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                John Doe<br />
                123 Main Street<br />
                San Francisco, CA 94102<br />
                United States
              </p>
            </Card>
            
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <Clock className="h-5 w-5 text-gray-600" />
                <h3 className="font-semibold">Order Timeline</h3>
              </div>
              <div className="space-y-3">
                {[
                  { status: 'Order Placed', date: 'Dec 8, 2024', time: '10:30 AM' },
                  { status: 'Processing', date: 'Dec 8, 2024', time: '11:45 AM' },
                  { status: 'Shipped', date: 'Dec 9, 2024', time: '2:00 PM' },
                  { status: 'Delivered', date: 'Dec 10, 2024', time: '4:30 PM' },
                ].map((event, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{event.status}</p>
                      <p className="text-xs text-gray-500">
                        {event.date} at {event.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            
            <div className="pt-4">
              <Button className="w-full" variant="outline">
                Download Invoice
              </Button>
            </div>
          </div>
        </PageFromBottom>
      </>
    );
  },
};

export const MultiStep: Story = {
  render: () => {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState(1);
    
    return (
      <>
        <div className="p-4">
          <Button onClick={() => { setIsOpen(true); setStep(1); }}>
            Start Process
          </Button>
        </div>
        <PageFromBottom
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          title={`Step ${step} of 3`}
          onBack={step > 1 ? () => setStep(step - 1) : undefined}
          onClose={() => setIsOpen(false)}
        >
          <div className="flex flex-col h-full">
            <div className="flex-1 p-4">
              {step === 1 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Choose Your Plan</h2>
                  <div className="space-y-3">
                    {['Basic', 'Pro', 'Enterprise'].map((plan) => (
                      <Card key={plan} interactive>
                        <h3 className="font-medium mb-2">{plan}</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Perfect for getting started
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              
              {step === 2 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Account Information</h2>
                  <form className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Email</label>
                      <input
                        type="email"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md"
                        placeholder="you@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Password</label>
                      <input
                        type="password"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md"
                        placeholder="••••••••"
                      />
                    </div>
                  </form>
                </div>
              )}
              
              {step === 3 && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Package className="h-8 w-8 text-green-600" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2">All Set!</h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    Your account has been created successfully
                  </p>
                </div>
              )}
            </div>
            
            <div className="border-t border-gray-200 dark:border-gray-800 p-4">
              <div className="flex gap-2 mb-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 h-1 rounded-full",
                      i <= step ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700"
                    )}
                  />
                ))}
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  if (step < 3) {
                    setStep(step + 1);
                  } else {
                    setIsOpen(false);
                  }
                }}
              >
                {step === 3 ? 'Get Started' : 'Continue'}
              </Button>
            </div>
          </div>
        </PageFromBottom>
      </>
    );
  },
};
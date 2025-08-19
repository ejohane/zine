import type { Meta, StoryObj } from '@storybook/react';
import { LongSheet } from './LongSheet';
import { Button } from '../../ui/button';
import { Badge } from '../../ui/badge';
import { cn } from '../../../lib/utils';
import { 
  FileText,
  Clock,
  User,
  Calendar,
  ChevronDown,
  Check
} from 'lucide-react';

const meta: Meta<typeof LongSheet> = {
  title: 'Silk/LongSheet',
  component: LongSheet,
  parameters: {
    layout: 'fullscreen',
    viewport: {
      viewports: {
        mobile: {
          name: 'Mobile',
          styles: {
            width: '375px',
            height: '812px',
          },
        },
        tablet: {
          name: 'Tablet',
          styles: {
            width: '768px',
            height: '1024px',
          },
        },
      },
      defaultViewport: 'responsive',
    },
    docs: {
      description: {
        component: 'A sheet component optimized for long, scrollable content with optional sticky footer.',
      },
      story: {
        inline: false,
        iframeHeight: 600,
      },
    },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ minHeight: '500px', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

const longArticleContent = `
# The Future of Web Development

Web development is constantly evolving, with new technologies and frameworks emerging regularly. This comprehensive guide explores the latest trends and what they mean for developers.

## Introduction

The landscape of web development has changed dramatically over the past decade. From the rise of JavaScript frameworks to the adoption of serverless architectures, developers today have more tools and options than ever before.

## Key Trends to Watch

### 1. AI-Powered Development

Artificial intelligence is revolutionizing how we write code. Tools like GitHub Copilot and ChatGPT are becoming integral parts of the development workflow, helping developers write code faster and more efficiently.

### 2. Edge Computing

Edge computing is bringing computation closer to users, reducing latency and improving performance. This trend is particularly important for applications that require real-time data processing.

### 3. Web Assembly

WebAssembly continues to gain traction, allowing developers to run high-performance applications in the browser. This opens up new possibilities for web applications that were previously limited to native platforms.

### 4. Micro-Frontends

The micro-frontend architecture is gaining popularity, allowing teams to develop and deploy frontend applications independently. This approach brings the benefits of microservices to the frontend world.

## Best Practices

- **Performance First**: Always prioritize performance in your applications
- **Accessibility**: Ensure your applications are accessible to all users
- **Security**: Implement security best practices from the start
- **Testing**: Write comprehensive tests for your code
- **Documentation**: Maintain clear and up-to-date documentation

## Conclusion

The future of web development is exciting and full of possibilities. By staying informed about the latest trends and best practices, developers can build better, more efficient applications that provide value to users.

---

*This article continues with more detailed sections on each topic, including code examples, case studies, and practical implementation guides.*
`;

export const Default: Story = {
  args: {
    trigger: <Button>Read Article</Button>,
    title: 'Article Content',
    description: 'Scroll to read the full article',
    children: (
      <div className="prose dark:prose-invert max-w-none pb-4">
        <div dangerouslySetInnerHTML={{ __html: longArticleContent.replace(/\n/g, '<br />') }} />
      </div>
    ),
  },
};

export const WithStickyFooter: Story = {
  args: {
    trigger: <Button>View Terms</Button>,
    title: 'Terms of Service',
    description: 'Please read and accept our terms',
    footer: (
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1">Decline</Button>
        <Button className="flex-1">Accept Terms</Button>
      </div>
    ),
    children: (
      <div className="space-y-4 pb-4">
        <section>
          <h3 className="font-semibold mb-2">1. Acceptance of Terms</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            By accessing and using this service, you accept and agree to be bound by the terms and provision of this agreement.
          </p>
        </section>
        
        <section>
          <h3 className="font-semibold mb-2">2. Use License</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Permission is granted to temporarily download one copy of the materials for personal, non-commercial transitory viewing only.
          </p>
        </section>
        
        <section>
          <h3 className="font-semibold mb-2">3. Disclaimer</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            The materials on this service are provided on an 'as is' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
          </p>
        </section>
        
        <section>
          <h3 className="font-semibold mb-2">4. Limitations</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            In no event shall our company or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on our service.
          </p>
        </section>
        
        {/* Repeat sections to demonstrate scrolling */}
        {[5, 6, 7, 8, 9, 10].map(num => (
          <section key={num}>
            <h3 className="font-semibold mb-2">{num}. Additional Terms</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
            </p>
          </section>
        ))}
      </div>
    ),
  },
};

export const ContentList: Story = {
  args: {
    trigger: <Button variant="outline">View All Items</Button>,
    title: 'Your Bookmarks',
    description: '245 items saved',
    initialHeight: 'full',
    children: (
      <div className="space-y-2 pb-4">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-medium">Bookmark Item {i + 1}</h4>
              <Badge variant="secondary">Article</Badge>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              This is a sample bookmark description that shows how content looks in a long scrollable list.
            </p>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Author Name
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Dec {i + 1}, 2024
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                5 min read
              </span>
            </div>
          </div>
        ))}
      </div>
    ),
  },
};

export const ChecklistSheet: Story = {
  args: {
    trigger: <Button>View Checklist</Button>,
    title: 'Setup Checklist',
    description: 'Complete these steps to get started',
    footer: (
      <div className="text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">4 of 10 completed</p>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div className="bg-blue-500 h-2 rounded-full" style={{ width: '40%' }} />
        </div>
      </div>
    ),
    children: (
      <div className="space-y-2 pb-4">
        {[
          { task: 'Create your account', completed: true },
          { task: 'Verify your email', completed: true },
          { task: 'Set up your profile', completed: true },
          { task: 'Import your bookmarks', completed: true },
          { task: 'Create your first collection', completed: false },
          { task: 'Customize your preferences', completed: false },
          { task: 'Connect social accounts', completed: false },
          { task: 'Install browser extension', completed: false },
          { task: 'Explore premium features', completed: false },
          { task: 'Invite team members', completed: false },
        ].map((item, index) => (
          <label
            key={index}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
          >
            <input
              type="checkbox"
              defaultChecked={item.completed}
              className="w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <span className={cn(
              "flex-1",
              item.completed && "line-through text-gray-500"
            )}>
              {item.task}
            </span>
            {item.completed && <Check className="h-4 w-4 text-green-500" />}
          </label>
        ))}
      </div>
    ),
  },
};

export const FullHeightGallery: Story = {
  args: {
    trigger: <Button>Open Gallery</Button>,
    title: 'Image Gallery',
    description: 'Swipe through your saved images',
    initialHeight: 'full',
    children: (
      <div className="space-y-4 pb-4">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="aspect-video bg-gradient-to-br from-blue-400 to-purple-600 rounded-lg flex items-center justify-center">
            <FileText className="h-12 w-12 text-white/50" />
          </div>
        ))}
      </div>
    ),
  },
};

export const NewsletterArchive: Story = {
  args: {
    trigger: <Button variant="outline">Browse Archive</Button>,
    title: 'Newsletter Archive',
    description: 'All past editions',
    children: (
      <div className="space-y-6 pb-4">
        {['December 2024', 'November 2024', 'October 2024'].map(month => (
          <div key={month}>
            <h3 className="font-semibold mb-3 sticky top-0 bg-white dark:bg-gray-900 py-2">
              {month}
            </h3>
            <div className="space-y-2">
              {[1, 2, 3, 4].map(week => (
                <button
                  key={week}
                  className="w-full text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">Week {week} Newsletter</span>
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Top stories, trending topics, and community highlights
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
  },
};
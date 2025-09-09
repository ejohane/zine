// Web-specific exports for the design system

// Provider exports
export { DesignSystemProvider } from './providers/DesignSystemProvider';

// Export wrapped components (these override HeroUI defaults)
export { Button } from './components/Button';
export { Input } from './components/Input';
export { Card, CardHeader, CardBody, CardFooter } from './components/Card';
export { Badge } from './components/Badge';
export { Avatar } from './components/Avatar';
export { Spinner } from './components/Spinner';
export { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from './components/Modal';
export { Select, SelectItem } from './components/Select';

// Re-export other HeroUI components for convenience (excluding our wrapped ones)
export {
  Accordion,
  AccordionItem,
  Autocomplete,
  AutocompleteItem,
  BreadcrumbItem,
  Breadcrumbs,
  Checkbox,
  CheckboxGroup,
  Chip,
  CircularProgress,
  Code,
  DateInput,
  DatePicker,
  DateRangePicker,
  Divider,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSection,
  DropdownTrigger,
  Image,
  Kbd,
  Link,
  Listbox,
  ListboxItem,
  ListboxSection,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
  Pagination,
  PaginationCursor,
  PaginationItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Radio,
  RadioGroup,
  ScrollShadow,
  Skeleton,
  Slider,
  Snippet,
  Spacer,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  Textarea,
  TimeInput,
  Tooltip,
  User,
  useDisclosure
} from '@heroui/react';

// Export utilities
export { cn } from '../lib/utils';

// Export Zine-specific pattern components
export { BookmarkCard } from './components/patterns/BookmarkCard';
export { SubscriptionItem } from './components/patterns/SubscriptionItem';
export { FeedCard } from './components/patterns/FeedCard';
export type { BookmarkCardProps } from './components/patterns/BookmarkCard';
export type { SubscriptionItemProps } from './components/patterns/SubscriptionItem';
export type { FeedCardProps } from './components/patterns/FeedCard';

// Export component types from our core types
export type {
  ButtonProps as ZineButtonProps,
  InputProps as ZineInputProps,
  CardProps as ZineCardProps,
  CardHeaderProps as ZineCardHeaderProps,
  CardBodyProps as ZineCardBodyProps,
  CardFooterProps as ZineCardFooterProps,
  BadgeProps as ZineBadgeProps,
  AvatarProps as ZineAvatarProps,
  SpinnerProps as ZineSpinnerProps,
  ModalProps as ZineModalProps,
  ModalContentProps as ZineModalContentProps,
  ModalHeaderProps as ZineModalHeaderProps,
  ModalBodyProps as ZineModalBodyProps,
  ModalFooterProps as ZineModalFooterProps,
  SelectProps as ZineSelectProps,
  SelectItemProps as ZineSelectItemProps
} from '../core/types/components';
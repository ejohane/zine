// Icon components using lucide-react-native
// All icons follow a consistent pattern: {size, color} props

import {
  Archive,
  Bookmark,
  CheckCircle,
  ChevronRight,
  CircleCheck,
  FileText,
  Filter,
  Headphones,
  Inbox,
  Play,
  Plus,
  PlusCircle,
  Rss,
  Search,
  Settings,
  Share2,
  Sparkles,
  Square,
  SquareCheck,
  Video,
} from 'lucide-react-native';

import { Colors } from '@/constants/theme';

// Standard icon props interface
interface IconProps {
  size?: number;
  color?: string;
}

const DEFAULT_ICON_COLOR = Colors.dark.textPrimary;
const DEFAULT_MUTED_ICON_COLOR = Colors.dark.icon;
const DEFAULT_DECORATIVE_ICON_COLOR = Colors.dark.statusInfo;
const DEFAULT_ICON_STROKE = Colors.dark.overlayForeground;

// =============================================================================
// Content type icons
// =============================================================================

export function ArticleIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <FileText size={size} color={color} fill={color} strokeWidth={0} />;
}

export function HeadphonesIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Headphones size={size} color={color} fill={color} strokeWidth={0} />;
}

export function VideoIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Video size={size} color={color} fill={color} strokeWidth={0} />;
}

// =============================================================================
// Selection icons
// =============================================================================

interface CheckboxIconProps extends IconProps {
  checked?: boolean;
}

export function CheckboxIcon({
  size = 24,
  color = DEFAULT_MUTED_ICON_COLOR,
  checked = false,
}: CheckboxIconProps) {
  if (checked) {
    return (
      <SquareCheck
        size={size}
        color={color}
        fill={color}
        stroke={DEFAULT_ICON_STROKE}
        strokeWidth={2}
      />
    );
  }
  return <Square size={size} color={color} strokeWidth={1.5} />;
}

// =============================================================================
// Navigation icons
// =============================================================================

export function ChevronRightIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <ChevronRight size={size} color={color} strokeWidth={2} />;
}

// =============================================================================
// Action icons
// =============================================================================

export function ArchiveIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Archive size={size} color={color} fill={color} strokeWidth={0} />;
}

export function BookmarkIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Bookmark size={size} color={color} fill={color} strokeWidth={0} />;
}

export function BookmarkOutlineIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Bookmark size={size} color={color} strokeWidth={1.5} />;
}

export function CheckIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <CheckCircle size={size} color={color} fill={color} strokeWidth={0} />;
}

export function CheckOutlineIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <CircleCheck size={size} color={color} strokeWidth={1.5} />;
}

export function FilterIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Filter size={size} color={color} strokeWidth={2} />;
}

export function PlayIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Play size={size} color={color} fill={color} strokeWidth={0} />;
}

export function PlusIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Plus size={size} color={color} strokeWidth={2} />;
}

export function PlusCircleIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <PlusCircle size={size} color={color} strokeWidth={2} />;
}

export function SearchIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Search size={size} color={color} strokeWidth={2} />;
}

export function SettingsIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Settings size={size} color={color} strokeWidth={2} />;
}

export function ShareIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Share2 size={size} color={color} strokeWidth={2} />;
}

// =============================================================================
// Decorative icons
// =============================================================================

export function InboxArrowIcon({ size = 64, color = DEFAULT_DECORATIVE_ICON_COLOR }: IconProps) {
  return <Inbox size={size} color={color} fill={color} strokeWidth={0} />;
}

export function SparklesIcon({ size = 24, color = DEFAULT_ICON_COLOR }: IconProps) {
  return <Sparkles size={size} color={color} fill={color} strokeWidth={0} />;
}

// =============================================================================
// Additional icons for inbox.tsx
// =============================================================================

export function SubscriptionsIcon({ size = 24, color = DEFAULT_DECORATIVE_ICON_COLOR }: IconProps) {
  return <Rss size={size} color={color} strokeWidth={2} />;
}

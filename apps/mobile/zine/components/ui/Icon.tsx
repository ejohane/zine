import * as Icons from 'lucide-react-native'

export interface IconProps {
  name: keyof typeof Icons
  size?: number | string
  color?: string
  strokeWidth?: number
}

export const Icon = ({ name, size = 24, color = '#000000', strokeWidth = 2 }: IconProps) => {
  const IconComponent = Icons[name] as any
  
  if (!IconComponent) {
    console.warn(`Icon "${name}" not found`)
    return null
  }
  
  return <IconComponent size={size} color={color} strokeWidth={strokeWidth} />
}

// Export commonly used icons for convenience
export {
  Home,
  Bookmark,
  Search,
  User,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  AlertCircle,
  Info,
  Share2,
  MoreVertical,
  MoreHorizontal,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Heart,
  Star,
  Trash2,
  Edit3 as Edit,
  Plus,
  Minus,
  Filter,
  ArrowDownNarrowWide as SortDesc,
  RefreshCw,
  Loader2,
  Moon,
  Sun,
  Music,
  Video,
  FileText,
  Rss,
} from 'lucide-react-native'
import { Bookmark } from '@zine/shared'
import { SectionHeader } from './SectionHeader'

interface ContentGridProps {
  title: string
  items: Bookmark[]
  type: 'episodes' | 'shows' | 'music'
}

export function ContentGrid({ title, items, type }: ContentGridProps) {
  if (items.length === 0) return null

  return (
    <div>
      <SectionHeader title={title} />
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.id} className="bg-surface rounded-lg p-3 flex items-center space-x-3">
            <div className="w-12 h-12 bg-spotify-green rounded flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-white text-sm line-clamp-2">{item.title}</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {type === 'episodes' ? 'Episode' : 'Show'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
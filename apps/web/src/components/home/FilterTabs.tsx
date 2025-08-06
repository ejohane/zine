interface FilterTabsProps {
  activeFilter: string
  onFilterChange: (filter: string) => void
}

const filters = ['All', 'Music', 'Podcasts', 'Audiobooks']

export function FilterTabs({ activeFilter, onFilterChange }: FilterTabsProps) {
  return (
    <div className="flex space-x-3">
      {filters.map((filter) => (
        <button
          key={filter}
          onClick={() => onFilterChange(filter)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            activeFilter === filter
              ? 'bg-spotify-green text-white'
              : 'bg-surface text-foreground hover:bg-surface-hover'
          }`}
        >
          {filter}
        </button>
      ))}
    </div>
  )
}
interface SectionHeaderProps {
  title: string
  showViewAll?: boolean
  onViewAll?: () => void
}

export function SectionHeader({ title, showViewAll, onViewAll }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      {showViewAll && (
        <button
          onClick={onViewAll}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </button>
      )}
    </div>
  )
}
export function BookmarkSkeleton() {
  return (
    <div className="bg-card rounded-lg p-4 animate-pulse">
      <div className="flex gap-4">
        {/* Thumbnail skeleton */}
        <div className="flex-shrink-0 w-24 h-24 md:w-32 md:h-32 rounded-md bg-secondary" />
        
        {/* Content skeleton */}
        <div className="flex-1">
          <div className="h-5 bg-secondary rounded w-3/4 mb-2" />
          <div className="h-4 bg-secondary rounded w-full mb-1" />
          <div className="h-4 bg-secondary rounded w-2/3 mb-3" />
          
          <div className="flex gap-3">
            <div className="h-3 bg-secondary rounded w-20" />
            <div className="h-3 bg-secondary rounded w-16" />
            <div className="h-3 bg-secondary rounded w-24" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function BookmarkSectionSkeleton() {
  return (
    <div className="mb-12">
      <div className="h-8 bg-secondary rounded w-48 mb-4" />
      <div className="flex gap-4 overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex-shrink-0 w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)] xl:w-[calc(25%-0.75rem)]">
            <BookmarkSkeleton />
          </div>
        ))}
      </div>
    </div>
  )
}
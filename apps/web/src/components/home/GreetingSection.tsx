import { useAuth } from '../../lib/auth'

export function GreetingSection() {
  const { user } = useAuth()
  
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const getTimeBasedMessage = () => {
    const hour = new Date().getHours()
    const day = new Date().getDay()
    
    if (day === 0 || day === 6) {
      return "Perfect time to catch up on your reading list"
    }
    
    if (hour < 9) return "Start your day with something inspiring"
    if (hour < 12) return "What would you like to explore today?"
    if (hour < 15) return "Take a break with your saved content"
    if (hour < 18) return "Discover something new from your collection"
    if (hour < 22) return "Wind down with your favorite bookmarks"
    return "Late night browsing? Find something interesting"
  }

  const userName = user?.firstName || user?.username || 'there'

  return (
    <div className="mb-8">
      <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
        {getGreeting()}, {userName}
      </h1>
      <p className="text-lg text-muted-foreground">
        {getTimeBasedMessage()}
      </p>
    </div>
  )
}
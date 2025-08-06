import { drizzle } from 'drizzle-orm/d1'
import { sql } from 'drizzle-orm'
import {
  userFeedItems,
  feedItems,
  userSubscriptions,
  subscriptions,
  userAccounts,
  subscriptionProviders
} from '../src/schema'

// This script deletes all subscription-related data from the database
// Run with: bun run scripts/delete-subscription-data.ts

async function deleteAllSubscriptionData() {
  try {
    // Initialize database connection
    // Note: You'll need to configure this based on your actual D1 setup
    const db = drizzle(/* your D1 database instance */)
    
    console.log('Starting deletion of subscription-related data...')
    
    // Delete in reverse order of dependencies
    
    // 1. Delete user_feed_items (depends on feed_items and users)
    console.log('Deleting user_feed_items...')
    await db.delete(userFeedItems).execute()
    
    // 2. Delete feed_items (depends on subscriptions)
    console.log('Deleting feed_items...')
    await db.delete(feedItems).execute()
    
    // 3. Delete user_subscriptions (depends on users and subscriptions)
    console.log('Deleting user_subscriptions...')
    await db.delete(userSubscriptions).execute()
    
    // 4. Delete subscriptions (depends on subscription_providers)
    console.log('Deleting subscriptions...')
    await db.delete(subscriptions).execute()
    
    // 5. Delete user_accounts (depends on users and subscription_providers)
    console.log('Deleting user_accounts...')
    await db.delete(userAccounts).execute()
    
    // 6. Delete subscription_providers (no dependencies)
    console.log('Deleting subscription_providers...')
    await db.delete(subscriptionProviders).execute()
    
    console.log('✅ All subscription-related data deleted successfully!')
    
  } catch (error) {
    console.error('❌ Error deleting data:', error)
    process.exit(1)
  }
}

// Run the deletion
deleteAllSubscriptionData()
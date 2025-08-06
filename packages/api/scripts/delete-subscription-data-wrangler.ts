#!/usr/bin/env bun
import { execSync } from 'child_process'

// Script to delete all subscription-related data using wrangler d1 execute
// Run with: bun run scripts/delete-subscription-data-wrangler.ts

const DATABASE_NAME = 'zine-db' // Replace with your actual D1 database name

const deleteCommands = [
  // Delete in reverse order of dependencies
  'DELETE FROM user_feed_items;',
  'DELETE FROM feed_items;',
  'DELETE FROM user_subscriptions;',
  'DELETE FROM subscriptions;',
  'DELETE FROM user_accounts;',
  'DELETE FROM subscription_providers;'
]

async function deleteAllSubscriptionData() {
  console.log('🗑️  Starting deletion of all subscription-related data...\n')

  for (const command of deleteCommands) {
    const tableName = command.match(/DELETE FROM (\w+);/)?.[1]
    console.log(`Deleting all rows from ${tableName}...`)
    
    try {
      // Execute the delete command using wrangler
      execSync(
        `bunx wrangler d1 execute ${DATABASE_NAME} --command="${command}"`,
        { stdio: 'inherit' }
      )
      console.log(`✅ ${tableName} cleared\n`)
    } catch (error) {
      console.error(`❌ Error deleting from ${tableName}:`, error)
      process.exit(1)
    }
  }

  console.log('✅ All subscription-related data deleted successfully!')
}

// Add confirmation prompt
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log('⚠️  WARNING: This will delete ALL data from the following tables:')
console.log('  - user_feed_items')
console.log('  - feed_items')
console.log('  - user_subscriptions')
console.log('  - subscriptions')
console.log('  - user_accounts')
console.log('  - subscription_providers\n')

readline.question('Are you sure you want to continue? (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes') {
    deleteAllSubscriptionData().then(() => {
      readline.close()
    })
  } else {
    console.log('Operation cancelled.')
    readline.close()
  }
})
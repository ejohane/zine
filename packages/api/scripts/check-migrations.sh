#!/bin/bash

# Check if migrations are already applied to the database
echo "🔍 Checking migration status..."

# Try to list migrations - this will show which ones are applied
bunx wrangler d1 migrations list zine-db-production --env production --remote 2>&1 | tee migration-status.log

# Check if the d1_migrations table exists and has entries
if grep -q "Applied" migration-status.log; then
    echo "✅ Migrations are already applied to the database"
    echo "📋 Applied migrations:"
    grep "Applied" migration-status.log
    exit 0
else
    echo "⚠️  No migrations applied yet or unable to check status"
    echo "Will attempt to apply migrations in the next step..."
    exit 0
fi
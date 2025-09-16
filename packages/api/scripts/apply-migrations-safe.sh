#!/bin/bash

echo "🚀 Applying database migrations..."

# Function to check if error is about existing migrations
check_migration_error() {
    local error_output="$1"
    
    # Check for common "already exists" errors
    if echo "$error_output" | grep -q "table.*already exists"; then
        return 0
    fi
    if echo "$error_output" | grep -q "d1_migrations.*already exists"; then
        return 0
    fi
    if echo "$error_output" | grep -q "No migrations to apply"; then
        return 0
    fi
    
    return 1
}

# Try to apply migrations
OUTPUT=$(bunx wrangler d1 migrations apply zine-db-production --env production --remote 2>&1)
EXIT_CODE=$?

echo "$OUTPUT"

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Migrations applied successfully!"
    exit 0
elif check_migration_error "$OUTPUT"; then
    echo "⚠️  Migrations already applied or no new migrations to apply"
    echo "📋 This is expected if the database is up to date"
    exit 0
else
    echo "❌ Migration failed with unexpected error"
    echo "Error details:"
    echo "$OUTPUT"
    exit 1
fi
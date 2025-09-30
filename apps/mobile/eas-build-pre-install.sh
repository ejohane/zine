#!/usr/bin/env bash

# Load environment variables based on EAS_BUILD_PROFILE
if [ "$EAS_BUILD_PROFILE" = "production" ]; then
  echo "Loading production environment variables..."
  if [ -f ".env.production" ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
    echo "Loaded .env.production"
  fi
elif [ "$EAS_BUILD_PROFILE" = "preview" ]; then
  echo "Loading preview environment variables..."
  if [ -f ".env.preview" ]; then
    export $(cat .env.preview | grep -v '^#' | xargs)
    echo "Loaded .env.preview"
  fi
elif [ "$EAS_BUILD_PROFILE" = "development" ]; then
  echo "Loading development environment variables..."
  if [ -f ".env.development" ]; then
    export $(cat .env.development | grep -v '^#' | xargs)
    echo "Loaded .env.development"
  fi
fi

# Verify that critical environment variables are set
if [ -z "$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY" ]; then
  echo "WARNING: EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set!"
fi

echo "Environment variables loaded for profile: $EAS_BUILD_PROFILE"
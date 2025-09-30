#!/bin/bash

# Test script for YouTube bookmark saving with detailed logging
# This will help identify where creator avatars are getting lost

echo "🔍 Testing YouTube Bookmark Save (Local Development)"
echo "===================================================="
echo ""

# Check if AUTH_TOKEN is provided
if [ -z "$AUTH_TOKEN" ]; then
    echo "❌ ERROR: Please provide AUTH_TOKEN environment variable"
    echo ""
    echo "Usage: AUTH_TOKEN='your_token' ./test-local-youtube-save.sh"
    echo ""
    echo "To get your auth token:"
    echo "1. Open the web app in browser and log in"
    echo "2. Open DevTools > Network tab"
    echo "3. Look for any API request"
    echo "4. Copy the Authorization header value (after 'Bearer ')"
    exit 1
fi

# YouTube video to test with (MrBeast - has profile image)
VIDEO_URL="https://www.youtube.com/watch?v=DuQbOQwVaNE"

echo "📝 Test Details:"
echo "  URL: $VIDEO_URL"
echo "  Token: ${AUTH_TOKEN:0:30}..."
echo ""

echo "📤 Sending request to API..."
echo ""

# Make the API request
RESPONSE=$(curl -s -X POST http://localhost:8787/api/v1/bookmarks/enriched \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$VIDEO_URL\", \"notes\": \"Testing creator avatar\"}")

# Check if request was successful
if echo "$RESPONSE" | grep -q '"data"'; then
    echo "✅ Bookmark saved successfully!"
    echo ""
    
    # Extract creator info using jq if available
    if command -v jq &> /dev/null; then
        echo "👤 Creator Data:"
        echo "$RESPONSE" | jq '.data.creator' 2>/dev/null || echo "$RESPONSE"
        
        # Check for avatar URL
        AVATAR_URL=$(echo "$RESPONSE" | jq -r '.data.creator.avatarUrl' 2>/dev/null)
        if [ "$AVATAR_URL" != "null" ] && [ -n "$AVATAR_URL" ]; then
            echo ""
            echo "🎉 SUCCESS: Creator avatar URL found!"
            echo "   URL: $AVATAR_URL"
        else
            echo ""
            echo "⚠️  PROBLEM: No creator avatar URL"
            echo ""
            echo "Check the API logs for details:"
            echo "tail -f /tmp/api-server-detailed.log | grep -E 'ApiEnrichment|DualModeTokenService|CreatorRepository'"
        fi
    else
        echo "Response:"
        echo "$RESPONSE" | python -m json.tool 2>/dev/null || echo "$RESPONSE"
    fi
else
    echo "❌ Request failed:"
    echo "$RESPONSE"
fi

echo ""
echo "===================================================="
echo "📋 Next Steps:"
echo "1. Check API logs: tail -100 /tmp/api-server-detailed.log"
echo "2. Look for [DualModeTokenService] - shows token retrieval"
echo "3. Look for [ApiEnrichment] - shows YouTube API calls"
echo "4. Look for [CreatorRepository] - shows database saves"
echo ""

# Check if YOUTUBE_API_KEY is configured
if grep -q "YOUTUBE_API_KEY" /Users/erikjohansson/dev/2025/zine/packages/api/.dev.vars 2>/dev/null; then
    echo "✅ YOUTUBE_API_KEY found in .dev.vars"
else
    echo "⚠️  No YOUTUBE_API_KEY in .dev.vars"
    echo "   Add it for local development without OAuth!"
fi
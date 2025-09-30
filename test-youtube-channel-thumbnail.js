#!/usr/bin/env node

// Test script to verify YouTube channel thumbnail is being fetched and saved

async function testYouTubeEnrichment() {
  const API_URL = 'http://localhost:8787/api/v1';
  
  // Test YouTube video URL
  const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Astley - Never Gonna Give You Up
  
  console.log('Testing YouTube enrichment for:', youtubeUrl);
  console.log('---');
  
  try {
    // First, we need a user token. For testing, we'll use a mock token
    // In production, this would be the actual user's Clerk token
    const mockToken = 'test-token'; // Replace with actual token if available
    
    // Save a YouTube bookmark
    const saveResponse = await fetch(`${API_URL}/bookmarks/enriched`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockToken}`
      },
      body: JSON.stringify({
        url: youtubeUrl,
        notes: 'Testing YouTube channel thumbnail extraction'
      })
    });
    
    if (!saveResponse.ok) {
      const error = await saveResponse.text();
      console.error('Failed to save bookmark:', saveResponse.status, error);
      return;
    }
    
    const result = await saveResponse.json();
    console.log('Bookmark saved successfully!');
    console.log('---');
    console.log('Bookmark ID:', result.data.id);
    console.log('Title:', result.data.title);
    console.log('Creator Info:');
    
    if (result.data.creator) {
      console.log('  - Name:', result.data.creator.name);
      console.log('  - Avatar URL:', result.data.creator.avatarUrl || 'NOT FOUND - THIS IS THE ISSUE');
      console.log('  - Handle:', result.data.creator.handle || 'N/A');
      console.log('  - Verified:', result.data.creator.verified || false);
      console.log('  - Subscriber Count:', result.data.creator.subscriberCount || 'N/A');
    } else {
      console.log('  No creator information found');
    }
    
    console.log('---');
    console.log('Enrichment Info:');
    console.log('  - Source:', result.data.enrichment?.source || 'N/A');
    console.log('  - API Used:', result.data.enrichment?.apiUsed || false);
    
  } catch (error) {
    console.error('Error testing YouTube enrichment:', error);
  }
}

// Run the test
testYouTubeEnrichment();
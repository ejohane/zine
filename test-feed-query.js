// Test script to verify the feed query works
const API_URL = 'http://localhost:8787';

async function testFeedQuery() {
  try {
    console.log('Testing feed query...');
    
    // First start the API server
    console.log('Make sure the API server is running with: cd packages/api && bun run dev');
    console.log('Then run this script again');
    
    // Test the feed endpoint
    const response = await fetch(`${API_URL}/api/v1/feed?unread=true&limit=5`, {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('Feed query failed:', response.status, error);
      return;
    }
    
    const data = await response.json();
    console.log('Feed query successful!');
    console.log('Feed items returned:', data.feedItems?.length || 0);
    
  } catch (error) {
    console.error('Error testing feed query:', error);
  }
}

// Run if this is the main module
if (require.main === module) {
  testFeedQuery();
}
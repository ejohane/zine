// Test script to verify the bookmark ID generation fix

// Test YouTube URLs
const youtubeUrls = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube.com/embed/dQw4w9WgXcQ',
  'https://www.youtube.com/shorts/abc123def456',
  'https://m.youtube.com/watch?v=test123&feature=share'
];

// Test Spotify URLs
const spotifyUrls = [
  'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
  'https://open.spotify.com/album/1A2GTWGtFfWp7KSQTwWOyo',
  'https://open.spotify.com/artist/0du5cEVlfwy76wBbO9jPeH',
  'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
  'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMT',
  'https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL'
];

function extractYouTubeId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\n?#/]+)/,
    /youtube\.com\/.*[?&]v=([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return null;
}

function extractSpotifyId(url) {
  const match = url.match(/spotify\.com\/(?:track|album|artist|playlist|episode|show)\/([^?/]+)/);
  return match ? match[1] : null;
}

console.log('Testing YouTube URL extraction:');
youtubeUrls.forEach(url => {
  const id = extractYouTubeId(url);
  const contentId = id ? `youtube-${id}` : `youtube-malformed-${btoa(url).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)}`;
  console.log(`URL: ${url}`);
  console.log(`  -> Content ID: ${contentId}`);
  console.log('');
});

console.log('\nTesting Spotify URL extraction:');
spotifyUrls.forEach(url => {
  const id = extractSpotifyId(url);
  const contentId = id ? `spotify-${id}` : `spotify-malformed-${btoa(url).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)}`;
  console.log(`URL: ${url}`);
  console.log(`  -> Content ID: ${contentId}`);
  console.log('');
});

// Test that different videos get different IDs
console.log('\n=== CRITICAL TEST: Different videos should have different IDs ===');
const video1 = 'https://www.youtube.com/watch?v=video1_id';
const video2 = 'https://www.youtube.com/watch?v=video2_id';

const id1 = extractYouTubeId(video1);
const id2 = extractYouTubeId(video2);

const contentId1 = `youtube-${id1}`;
const contentId2 = `youtube-${id2}`;

console.log(`Video 1: ${video1} -> ${contentId1}`);
console.log(`Video 2: ${video2} -> ${contentId2}`);
console.log(`IDs are different: ${contentId1 !== contentId2 ? '✅ PASS' : '❌ FAIL'}`);
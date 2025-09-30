/**
 * Test script to verify date normalization for YouTube and Spotify content
 */

// Test YouTube date format (ISO 8601)
const youtubeDate = "2024-03-15T10:30:00Z";
const youtubeDateObj = new Date(youtubeDate);
const youtubeTimestamp = youtubeDateObj.getTime();

console.log("YouTube Date Processing:");
console.log("  Original:", youtubeDate);
console.log("  Date object:", youtubeDateObj.toISOString());
console.log("  Timestamp (ms):", youtubeTimestamp);
console.log("  Timestamp (s):", Math.floor(youtubeTimestamp / 1000));
console.log("");

// Test Spotify date format (YYYY-MM-DD)
const spotifyDate = "2024-03-15";
// Add noon UTC to avoid timezone issues
const spotifyDateObj = new Date(`${spotifyDate}T12:00:00Z`);
const spotifyTimestamp = spotifyDateObj.getTime();

console.log("Spotify Date Processing:");
console.log("  Original:", spotifyDate);
console.log("  Date object:", spotifyDateObj.toISOString());
console.log("  Timestamp (ms):", spotifyTimestamp);
console.log("  Timestamp (s):", Math.floor(spotifyTimestamp / 1000));
console.log("");

// Verify the problematic timestamp
const problemTimestamp = 1758988801;
console.log("Problem Timestamp Analysis:");
console.log("  Value:", problemTimestamp);
console.log("  As milliseconds:", new Date(problemTimestamp).toISOString());
console.log("  As seconds:", new Date(problemTimestamp * 1000).toISOString());
console.log("");

// Expected correct format for database storage
console.log("Database Storage Format:");
console.log("  Should store as: Unix timestamp in milliseconds");
console.log("  Example: ", youtubeTimestamp, "for", youtubeDate);
console.log("");

// Mobile app display
console.log("Mobile App Display:");
console.log("  Receives: Unix timestamp in milliseconds");
console.log("  Converts to: Date object using new Date(timestamp)");
console.log("  Displays as: Relative time (e.g., '2 hours ago') or short date (e.g., 'Mar 15')");
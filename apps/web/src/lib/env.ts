const fallbackApiUrl = 'http://localhost:8787';
export const WEB_APP_VERSION = __APP_VERSION__;
export const API_URL = import.meta.env.VITE_API_URL?.trim() || fallbackApiUrl;
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || '';
export const YOUTUBE_CLIENT_ID = import.meta.env.VITE_YOUTUBE_CLIENT_ID?.trim() || '';
export const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim() || '';
export const ONBOARDING_MOCK_MODE =
  import.meta.env.VITE_ONBOARDING_MOCK_MODE?.trim().toLowerCase() || '';

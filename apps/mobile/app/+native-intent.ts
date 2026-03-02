/**
 * Native intent redirect for OS-level deep links.
 *
 * `expo-sharing` opens the host app with `zine://expo-sharing`.
 * Route that path to a dedicated handler screen that reads share payloads.
 */
export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const parsed = new URL(path, 'zine://');
    if (parsed.hostname === 'expo-sharing') {
      return '/handle-share';
    }
  } catch {
    // Keep the original path for expo-router to resolve.
  }

  return path;
}

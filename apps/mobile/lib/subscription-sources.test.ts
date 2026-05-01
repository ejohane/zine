import {
  formatSourceCount,
  getHubStatusText,
  getIntegrationCardCopy,
  getIntegrationState,
} from './subscription-sources';

describe('subscription source helpers', () => {
  it('maps RSS to the manual integration state', () => {
    expect(getIntegrationState('RSS', null)).toBe('manual');
  });

  it('formats hub status text for connected sources', () => {
    expect(getHubStatusText('YOUTUBE', 'connected', 3)).toBe(
      'Integration connected · 3 subscriptions'
    );
  });

  it('formats RSS counts using feed terminology', () => {
    expect(formatSourceCount('RSS', 2)).toBe('2 feeds');
  });

  it('formats X bookmark counts using bookmark terminology', () => {
    expect(formatSourceCount('X', 2)).toBe('2 bookmarks');
  });

  it('returns X integration copy with the conservative sync cap', () => {
    expect(getIntegrationCardCopy('X', 'notConnected')).toEqual({
      title: 'Integration not connected',
      description:
        'Connect X to import bookmarked posts into your Zine library with a strict daily sync cap.',
      actionLabel: 'Connect',
    });
  });

  it('returns reconnect copy for integrations that need attention', () => {
    expect(getIntegrationCardCopy('SPOTIFY', 'needsAttention')).toEqual({
      title: 'Integration needs attention',
      description: 'Reconnect Spotify to keep subscriptions syncing into your inbox.',
      actionLabel: 'Reconnect',
    });
  });
});

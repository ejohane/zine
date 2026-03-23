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

  it('returns reconnect copy for integrations that need attention', () => {
    expect(getIntegrationCardCopy('SPOTIFY', 'needsAttention')).toEqual({
      title: 'Integration needs attention',
      description: 'Reconnect Spotify to keep subscriptions syncing into your inbox.',
      actionLabel: 'Reconnect',
    });
  });
});

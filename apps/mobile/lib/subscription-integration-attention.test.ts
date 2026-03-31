import { getSubscriptionIntegrationAttention } from '@/lib/subscription-integration-attention';

describe('getSubscriptionIntegrationAttention', () => {
  it('counts reconnect-required integrations', () => {
    expect(
      getSubscriptionIntegrationAttention([{ provider: 'SPOTIFY', status: 'EXPIRED' }], [])
    ).toEqual({
      attentionCount: 1,
      hasAttention: true,
      providers: ['SPOTIFY'],
    });
  });

  it('counts disconnected subscriptions when the provider is no longer actively connected', () => {
    expect(
      getSubscriptionIntegrationAttention([], [{ provider: 'YOUTUBE', status: 'DISCONNECTED' }])
    ).toEqual({
      attentionCount: 1,
      hasAttention: true,
      providers: ['YOUTUBE'],
    });
  });

  it('ignores disconnected subscriptions when the integration is still connected', () => {
    expect(
      getSubscriptionIntegrationAttention(
        [{ provider: 'YOUTUBE', status: 'ACTIVE' }],
        [{ provider: 'YOUTUBE', status: 'DISCONNECTED' }]
      )
    ).toEqual({
      attentionCount: 0,
      hasAttention: false,
      providers: [],
    });
  });
});

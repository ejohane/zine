import { tokenCache } from '../auth';

describe('tokenCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getToken', () => {
    it('returns null when no token exists', async () => {
      const result = await tokenCache.getToken('test-key');
      expect(result).toBeNull();
    });
  });

  describe('saveToken', () => {
    it('saves token without throwing', async () => {
      await expect(tokenCache.saveToken('test-key', 'test-value')).resolves.not.toThrow();
    });
  });
});

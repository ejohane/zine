export interface FeatureFlags {
  useDurableObjectsForTokens: boolean;
  durableObjectsRolloutPercentage: number;
  enableDualModeTokenStorage: boolean;
  enableMigrationMetrics: boolean;
}

export class FeatureFlagService {
  private flags: FeatureFlags;

  constructor(initialFlags?: Partial<FeatureFlags>) {
    this.flags = {
      useDurableObjectsForTokens: false,
      durableObjectsRolloutPercentage: 0,
      enableDualModeTokenStorage: false,
      enableMigrationMetrics: false,
      ...initialFlags
    };
  }

  /**
   * Check if a user should use Durable Objects based on rollout percentage
   */
  shouldUseDurableObjects(userId: string): boolean {
    if (!this.flags.useDurableObjectsForTokens) {
      return false;
    }

    // If 100% rollout, all users use DOs
    if (this.flags.durableObjectsRolloutPercentage >= 100) {
      return true;
    }

    // Use consistent hashing to determine if user is in rollout
    const hash = this.hashUserId(userId);
    const threshold = this.flags.durableObjectsRolloutPercentage / 100;
    return hash < threshold;
  }

  /**
   * Get all feature flags
   */
  getFlags(): FeatureFlags {
    return { ...this.flags };
  }

  /**
   * Update feature flags
   */
  updateFlags(updates: Partial<FeatureFlags>): void {
    this.flags = { ...this.flags, ...updates };
  }

  /**
   * Get flag value
   */
  getFlag<K extends keyof FeatureFlags>(flag: K): FeatureFlags[K] {
    return this.flags[flag];
  }

  /**
   * Set flag value
   */
  setFlag<K extends keyof FeatureFlags>(flag: K, value: FeatureFlags[K]): void {
    this.flags[flag] = value;
  }

  /**
   * Simple hash function to consistently assign users to rollout groups
   */
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to 0-1 range
    return Math.abs(hash) / 2147483647;
  }

  /**
   * Create from environment variables
   */
  static fromEnv(env: any): FeatureFlagService {
    return new FeatureFlagService({
      useDurableObjectsForTokens: env.FEATURE_USE_DO_TOKENS === 'true',
      durableObjectsRolloutPercentage: parseInt(env.FEATURE_DO_ROLLOUT_PERCENTAGE || '0'),
      enableDualModeTokenStorage: env.FEATURE_DUAL_MODE_TOKENS === 'true',
      enableMigrationMetrics: env.FEATURE_MIGRATION_METRICS === 'true'
    });
  }
}

// Global instance for the worker
let featureFlagService: FeatureFlagService | null = null;

export function getFeatureFlagService(env?: any): FeatureFlagService {
  if (!featureFlagService) {
    featureFlagService = env ? FeatureFlagService.fromEnv(env) : new FeatureFlagService();
  }
  return featureFlagService;
}
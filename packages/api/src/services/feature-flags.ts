export interface FeatureFlags {
  durableObjectsRolloutPercentage: number;
  enableDualModeTokenStorage: boolean;
  enableMigrationMetrics: boolean;
}

export class FeatureFlagService {
  private flags: FeatureFlags;

  constructor(initialFlags?: Partial<FeatureFlags>) {
    this.flags = {
      durableObjectsRolloutPercentage: 0,
      enableDualModeTokenStorage: false,
      enableMigrationMetrics: false,
      ...initialFlags
    };
  }

  /**
   * Check if a user should use Durable Objects based on rollout percentage
   * Note: This is now always true as we've migrated to Durable Objects for all users
   */
  shouldUseDurableObjects(_userId: string): boolean {
    // Always use Durable Objects - keeping method for backward compatibility
    return true;
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
   * Create from environment variables
   */
  static fromEnv(env: any): FeatureFlagService {
    return new FeatureFlagService({
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
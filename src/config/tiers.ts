import pino from 'pino';

const logger = pino({
  name: 'gateway:tiers',
  level: process.env.LOG_LEVEL || 'info',
});

export interface TierConfig {
  name: string;
  monthlyQuota: number;
  rateLimit: {
    requests: number;
    window: number; // seconds
  };
  features: {
    promptInjection: boolean;
    piiDetection: boolean;
    piiMasking: boolean;
    riskScoring: boolean;
    hotReload: boolean;
    webhooks: boolean;
    advancedMetrics: boolean;
    s3Logging: boolean;
    customPolicies: boolean;
  };
  logging: {
    enabled: boolean;
    retentionDays: number;
    includeContent: boolean;
  };
  support: 'docs' | 'email' | 'priority';
  price: {
    monthly: number;
    annual: number; // 2 months free
  };
}

export const TIER_CONFIGS: Record<string, TierConfig> = {
  free: {
    name: 'Free',
    monthlyQuota: 1000,
    rateLimit: { requests: 10, window: 60 },
    features: {
      promptInjection: true,
      piiDetection: true,
      piiMasking: false,
      riskScoring: false,
      hotReload: false,
      webhooks: false,
      advancedMetrics: false,
      s3Logging: false,
      customPolicies: false,
    },
    logging: {
      enabled: true,
      retentionDays: 7,
      includeContent: false,
    },
    support: 'docs',
    price: {
      monthly: 0,
      annual: 0,
    },
  },
  starter: {
    name: 'Starter',
    monthlyQuota: 10000,
    rateLimit: { requests: 100, window: 60 },
    features: {
      promptInjection: true,
      piiDetection: true,
      piiMasking: true,
      riskScoring: false,
      hotReload: true,
      webhooks: false,
      advancedMetrics: false,
      s3Logging: true,
      customPolicies: true,
    },
    logging: {
      enabled: true,
      retentionDays: 30,
      includeContent: false,
    },
    support: 'email',
    price: {
      monthly: 29,
      annual: 290, // 2 months free
    },
  },
  pro: {
    name: 'Pro',
    monthlyQuota: 100000,
    rateLimit: { requests: 1000, window: 60 },
    features: {
      promptInjection: true,
      piiDetection: true,
      piiMasking: true,
      riskScoring: true,
      hotReload: true,
      webhooks: true,
      advancedMetrics: true,
      s3Logging: true,
      customPolicies: true,
    },
    logging: {
      enabled: true,
      retentionDays: 90,
      includeContent: true,
    },
    support: 'priority',
    price: {
      monthly: 99,
      annual: 990, // 2 months free
    },
  },
};

export class TierManager {
  private static instance: TierManager;

  private constructor() {}

  static getInstance(): TierManager {
    if (!TierManager.instance) {
      TierManager.instance = new TierManager();
    }
    return TierManager.instance;
  }

  /**
   * Get tier configuration by name
   */
  getTierConfig(tierName: string): TierConfig {
    const config = TIER_CONFIGS[tierName.toLowerCase()];
    if (!config) {
      logger.warn(`Unknown tier: ${tierName}, falling back to free`);
      return TIER_CONFIGS.free;
    }
    return config;
  }

  /**
   * Check if feature is enabled for tier
   */
  isFeatureEnabled(tierName: string, feature: keyof TierConfig['features']): boolean {
    const config = this.getTierConfig(tierName);
    return config.features[feature];
  }

  /**
   * Get rate limit for tier
   */
  getRateLimit(tierName: string): { requests: number; window: number } {
    const config = this.getTierConfig(tierName);
    return config.rateLimit;
  }

  /**
   * Get monthly quota for tier
   */
  getMonthlyQuota(tierName: string): number {
    const config = this.getTierConfig(tierName);
    return config.monthlyQuota;
  }

  /**
   * Check if user has exceeded quota
   */
  hasExceededQuota(tierName: string, currentUsage: number): boolean {
    const quota = this.getMonthlyQuota(tierName);
    return currentUsage >= quota;
  }

  /**
   * Get usage percentage
   */
  getUsagePercentage(tierName: string, currentUsage: number): number {
    const quota = this.getMonthlyQuota(tierName);
    return Math.min(100, (currentUsage / quota) * 100);
  }

  /**
   * Get all available tiers for pricing page
   */
  getAllTiers(): TierConfig[] {
    return Object.values(TIER_CONFIGS);
  }

  /**
   * Get tier upgrade suggestions
   */
  getUpgradeSuggestion(currentTier: string, currentUsage: number): string | null {
    const config = this.getTierConfig(currentTier);
    const usagePercentage = this.getUsagePercentage(currentTier, currentUsage);

    // Suggest upgrade if usage > 80%
    if (usagePercentage > 80) {
      if (currentTier === 'free') return 'starter';
      if (currentTier === 'starter') return 'pro';
      if (currentTier === 'pro') return 'enterprise'; // Contact sales
    }

    return null;
  }

  /**
   * Calculate overage charges (for future use)
   */
  calculateOverage(tierName: string, currentUsage: number): number {
    const config = this.getTierConfig(tierName);
    
    if (currentUsage <= config.monthlyQuota) {
      return 0;
    }

    const overage = currentUsage - config.monthlyQuota;
    
    // Overage pricing (per 1000 requests)
    const overagePricing = {
      free: 0, // No overage for free tier - hard limit
      starter: 0.05, // $0.05 per 1000 requests
      pro: 0.03, // $0.03 per 1000 requests
    };

    const pricePerThousand = overagePricing[tierName as keyof typeof overagePricing] || 0;
    return Math.ceil(overage / 1000) * pricePerThousand;
  }

  /**
   * Get feature comparison for pricing page
   */
  getFeatureComparison(): Array<{
    feature: string;
    free: boolean | string;
    starter: boolean | string;
    pro: boolean | string;
  }> {
    return [
      {
        feature: 'Monthly Requests',
        free: '1,000',
        starter: '10,000',
        pro: '100,000',
      },
      {
        feature: 'Prompt Injection Protection',
        free: true,
        starter: true,
        pro: true,
      },
      {
        feature: 'PII Detection',
        free: true,
        starter: true,
        pro: true,
      },
      {
        feature: 'PII Masking',
        free: false,
        starter: true,
        pro: true,
      },
      {
        feature: 'Risk Scoring',
        free: false,
        starter: false,
        pro: true,
      },
      {
        feature: 'Custom Policies',
        free: false,
        starter: true,
        pro: true,
      },
      {
        feature: 'Webhooks',
        free: false,
        starter: false,
        pro: true,
      },
      {
        feature: 'Advanced Metrics',
        free: false,
        starter: false,
        pro: true,
      },
      {
        feature: 'Log Retention',
        free: '7 days',
        starter: '30 days',
        pro: '90 days',
      },
      {
        feature: 'Support',
        free: 'Documentation',
        starter: 'Email',
        pro: 'Priority',
      },
    ];
  }
}

// Export singleton instance
export const tierManager = TierManager.getInstance();

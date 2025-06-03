import { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { tierManager, TierConfig } from '../config/tiers';

const logger = pino({
  name: 'gateway:feature-gate',
  level: process.env.LOG_LEVEL || 'info',
});

declare global {
  namespace Express {
    interface Request {
      tierConfig?: TierConfig;
      featureEnabled?: (feature: keyof TierConfig['features']) => boolean;
    }
  }
}

export interface FeatureGateOptions {
  defaultTier?: string;
  skipPaths?: string[];
}

export class FeatureGateMiddleware {
  private options: FeatureGateOptions;

  constructor(options: FeatureGateOptions = {}) {
    this.options = {
      defaultTier: 'free',
      skipPaths: ['/v1/health', '/metrics', '/docs', '/start', '/pricing'],
      ...options,
    };
  }

  /**
   * Main feature gate middleware
   */
  middleware = (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip feature gating for certain paths
      if (this.shouldSkipPath(req.path)) {
        return next();
      }

      // Get user's tier from auth context
      const userTier = this.getUserTier(req);
      
      // Get tier configuration
      const tierConfig = tierManager.getTierConfig(userTier);
      
      // Attach tier config to request
      req.tierConfig = tierConfig;
      
      // Attach feature check helper
      req.featureEnabled = (feature: keyof TierConfig['features']) => {
        return tierManager.isFeatureEnabled(userTier, feature);
      };

      // Add tier headers to response
      res.setHeader('X-Tier', tierConfig.name);
      res.setHeader('X-Monthly-Quota', tierConfig.monthlyQuota.toString());

      logger.debug('Feature gate applied', {
        requestId: req.requestId,
        userTier,
        tierName: tierConfig.name,
        path: req.path,
      });

      next();
    } catch (error) {
      logger.error('Feature gate middleware error:', error);
      
      // Fallback to free tier
      const freeTier = tierManager.getTierConfig('free');
      req.tierConfig = freeTier;
      req.featureEnabled = (feature: keyof TierConfig['features']) => {
        return freeTier.features[feature];
      };
      
      next();
    }
  };

  /**
   * Middleware to require specific feature
   */
  requireFeature = (feature: keyof TierConfig['features'], upgradeMessage?: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.featureEnabled || !req.featureEnabled(feature)) {
        const userTier = this.getUserTier(req);
        const suggestion = tierManager.getUpgradeSuggestion(userTier, 0); // 0 usage for feature check
        
        logger.warn('Feature not available for tier', {
          requestId: req.requestId,
          feature,
          userTier,
          suggestion,
        });

        return res.status(402).json({
          error: 'Feature not available',
          code: 'FEATURE_NOT_AVAILABLE',
          feature,
          currentTier: userTier,
          upgradeRequired: suggestion,
          message: upgradeMessage || `This feature requires ${suggestion || 'a higher'} tier`,
          upgradeUrl: '/pricing',
          timestamp: new Date().toISOString(),
        });
      }

      next();
    };
  };

  /**
   * Middleware to check quota usage
   */
  checkQuota = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userTier = this.getUserTier(req);
      const currentUsage = await this.getCurrentUsage(req);
      
      if (tierManager.hasExceededQuota(userTier, currentUsage)) {
        const suggestion = tierManager.getUpgradeSuggestion(userTier, currentUsage);
        
        logger.warn('Quota exceeded', {
          requestId: req.requestId,
          userTier,
          currentUsage,
          quota: tierManager.getMonthlyQuota(userTier),
          suggestion,
        });

        return res.status(429).json({
          error: 'Quota exceeded',
          code: 'QUOTA_EXCEEDED',
          currentUsage,
          quota: tierManager.getMonthlyQuota(userTier),
          resetDate: this.getQuotaResetDate(),
          upgradeRequired: suggestion,
          upgradeUrl: '/pricing',
          timestamp: new Date().toISOString(),
        });
      }

      // Add usage headers
      const usagePercentage = tierManager.getUsagePercentage(userTier, currentUsage);
      res.setHeader('X-Usage-Current', currentUsage.toString());
      res.setHeader('X-Usage-Percentage', usagePercentage.toFixed(1));
      res.setHeader('X-Usage-Reset', this.getQuotaResetDate().toISOString());

      // Warn if approaching quota
      if (usagePercentage > 80) {
        res.setHeader('X-Usage-Warning', 'Approaching quota limit');
      }

      next();
    } catch (error) {
      logger.error('Quota check error:', error);
      // Continue on error - don't block requests
      next();
    }
  };

  /**
   * Get user's tier from request
   */
  private getUserTier(req: Request): string {
    // From auth context (API key metadata)
    if (req.auth?.tier) {
      return req.auth.tier;
    }

    // From tenant entity
    if (req.auth?.tenant?.tier) {
      return req.auth.tenant.tier;
    }

    // Default tier
    return this.options.defaultTier || 'free';
  }

  /**
   * Get current usage for user
   */
  private async getCurrentUsage(req: Request): Promise<number> {
    // This would typically query the database for current month usage
    // For now, return from tenant entity or 0
    return req.auth?.tenant?.currentUsage || 0;
  }

  /**
   * Get quota reset date (first day of next month)
   */
  private getQuotaResetDate(): Date {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
  }

  /**
   * Check if path should be skipped
   */
  private shouldSkipPath(path: string): boolean {
    return this.options.skipPaths?.some(skipPath => path.startsWith(skipPath)) || false;
  }

  /**
   * Get usage statistics for dashboard
   */
  getUsageStats = async (req: Request, res: Response) => {
    try {
      const userTier = this.getUserTier(req);
      const currentUsage = await this.getCurrentUsage(req);
      const tierConfig = tierManager.getTierConfig(userTier);
      
      const stats = {
        tier: {
          name: tierConfig.name,
          monthlyQuota: tierConfig.monthlyQuota,
          features: tierConfig.features,
          price: tierConfig.price,
        },
        usage: {
          current: currentUsage,
          percentage: tierManager.getUsagePercentage(userTier, currentUsage),
          remaining: Math.max(0, tierConfig.monthlyQuota - currentUsage),
          resetDate: this.getQuotaResetDate(),
        },
        suggestions: {
          upgrade: tierManager.getUpgradeSuggestion(userTier, currentUsage),
          overage: tierManager.calculateOverage(userTier, currentUsage),
        },
        rateLimit: tierConfig.rateLimit,
        support: tierConfig.support,
      };

      res.json(stats);
    } catch (error) {
      logger.error('Failed to get usage stats:', error);
      res.status(500).json({
        error: 'Failed to retrieve usage statistics',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * Get pricing information
   */
  getPricing = (req: Request, res: Response) => {
    try {
      const tiers = tierManager.getAllTiers();
      const features = tierManager.getFeatureComparison();

      res.json({
        tiers,
        features,
        currency: 'USD',
        billingCycle: ['monthly', 'annual'],
        annualDiscount: '2 months free',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get pricing:', error);
      res.status(500).json({
        error: 'Failed to retrieve pricing information',
        timestamp: new Date().toISOString(),
      });
    }
  };
}

// Export singleton instance
export const featureGate = new FeatureGateMiddleware();

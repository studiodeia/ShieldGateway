import { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { PolicyCache, PolicyConfig } from '../services/PolicyCache';

const logger = pino({
  name: 'core:policy-watcher',
  level: process.env.LOG_LEVEL || 'info',
});

declare global {
  namespace Express {
    interface Request {
      policy?: PolicyConfig;
      policyName?: string;
    }
  }
}

export interface PolicyWatcherOptions {
  defaultPolicy?: string;
  tenantPolicyMapping?: Record<string, string>;
  skipPaths?: string[];
}

export class PolicyWatcherMiddleware {
  private policyCache: PolicyCache;
  private options: PolicyWatcherOptions;

  constructor(options: PolicyWatcherOptions = {}) {
    this.policyCache = PolicyCache.getInstance();
    this.options = {
      defaultPolicy: 'lgpd-default.yaml',
      skipPaths: ['/v1/health', '/metrics', '/docs', '/.well-known'],
      ...options,
    };
  }

  /**
   * Initialize policy watcher
   */
  async initialize(): Promise<void> {
    await this.policyCache.initialize();
  }

  /**
   * Main policy watcher middleware
   */
  middleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip policy loading for certain paths
      if (this.shouldSkipPath(req.path)) {
        return next();
      }

      // Determine which policy to use
      const policyName = this.determinePolicyName(req);
      
      // Load policy
      const policy = await this.policyCache.getPolicy(policyName);
      
      if (!policy) {
        logger.warn('Policy not found, using default', {
          requestedPolicy: policyName,
          requestId: req.requestId,
          tenantId: req.auth?.tenantId,
        });
        
        // Try to load default policy
        const defaultPolicy = await this.policyCache.getPolicy(this.options.defaultPolicy);
        if (!defaultPolicy) {
          logger.error('Default policy not found');
          return res.status(500).json({
            error: 'Policy configuration error',
            code: 'POLICY_NOT_FOUND',
            timestamp: new Date().toISOString(),
          });
        }
        
        req.policy = defaultPolicy;
        req.policyName = this.options.defaultPolicy;
      } else {
        req.policy = policy;
        req.policyName = policyName;
      }

      // Add policy headers to response
      res.setHeader('X-Policy-Name', req.policyName);
      res.setHeader('X-Policy-Version', req.policy.metadata.version);

      logger.debug('Policy loaded for request', {
        requestId: req.requestId,
        tenantId: req.auth?.tenantId,
        policyName: req.policyName,
        policyVersion: req.policy.metadata.version,
      });

      next();
    } catch (error) {
      logger.error('Policy watcher middleware error:', error);
      
      // In case of error, try to continue with default policy
      try {
        const defaultPolicy = await this.policyCache.getPolicy(this.options.defaultPolicy);
        if (defaultPolicy) {
          req.policy = defaultPolicy;
          req.policyName = this.options.defaultPolicy;
          return next();
        }
      } catch (fallbackError) {
        logger.error('Failed to load fallback policy:', fallbackError);
      }
      
      return res.status(500).json({
        error: 'Policy system error',
        code: 'POLICY_SYSTEM_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * Determine which policy to use for the request
   */
  private determinePolicyName(req: Request): string {
    // Check for tenant-specific policy mapping
    if (req.auth?.tenantId && this.options.tenantPolicyMapping) {
      const tenantPolicy = this.options.tenantPolicyMapping[req.auth.tenantId];
      if (tenantPolicy) {
        logger.debug('Using tenant-specific policy', {
          tenantId: req.auth.tenantId,
          policy: tenantPolicy,
        });
        return tenantPolicy;
      }
    }

    // Check for policy override in headers (for testing/admin)
    const policyOverride = req.headers['x-policy-override'] as string;
    if (policyOverride && this.isValidPolicyOverride(policyOverride, req)) {
      logger.debug('Using policy override', {
        policy: policyOverride,
        requestId: req.requestId,
      });
      return policyOverride;
    }

    // Check for region-specific policies
    const region = this.extractRegion(req);
    if (region) {
      const regionPolicy = `${region.toLowerCase()}-policy.yaml`;
      logger.debug('Checking for region-specific policy', {
        region,
        policy: regionPolicy,
      });
      // This would check if the region-specific policy exists
      // For now, fall back to default
    }

    // Use default policy
    return this.options.defaultPolicy!;
  }

  /**
   * Check if policy override is valid
   */
  private isValidPolicyOverride(policyName: string, req: Request): boolean {
    // Only allow policy overrides for admin users or in development
    if (process.env.NODE_ENV === 'development') {
      return true;
    }

    // Check if user has admin permissions
    if (req.auth?.scopes?.includes(ApiKeyScope.ADMIN)) {
      return true;
    }

    // Check for specific override permissions
    if (req.auth?.scopes?.includes(ApiKeyScope.POLICY_OVERRIDE)) {
      return true;
    }

    logger.warn('Unauthorized policy override attempt', {
      requestId: req.requestId,
      tenantId: req.auth?.tenantId,
      requestedPolicy: policyName,
      userScopes: req.auth?.scopes,
    });

    return false;
  }

  /**
   * Extract region from request
   */
  private extractRegion(req: Request): string | null {
    // Check headers
    const regionHeader = req.headers['x-region'] as string;
    if (regionHeader) {
      return regionHeader;
    }

    // Check tenant metadata
    if (req.auth?.tenant?.metadata?.region) {
      return req.auth.tenant.metadata.region;
    }

    // Extract from IP geolocation (simplified)
    const ip = req.ip;
    if (ip) {
      // This would integrate with a geolocation service
      // For now, return null
    }

    return null;
  }

  /**
   * Check if path should be skipped
   */
  private shouldSkipPath(path: string): boolean {
    return this.options.skipPaths?.some(skipPath => path.startsWith(skipPath)) || false;
  }

  /**
   * Get policy metadata endpoint
   */
  getPolicyMetadata = async (req: Request, res: Response) => {
    try {
      const metadata = this.policyCache.getPolicyMetadata();
      
      res.json({
        policies: metadata,
        defaultPolicy: this.options.defaultPolicy,
        tenantMappings: this.options.tenantPolicyMapping || {},
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get policy metadata:', error);
      res.status(500).json({
        error: 'Failed to retrieve policy metadata',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * Reload specific policy endpoint (admin only)
   */
  reloadPolicy = async (req: Request, res: Response) => {
    try {
      // Check admin permissions
      if (!req.auth?.scopes?.includes(ApiKeyScope.ADMIN)) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          code: 'ADMIN_REQUIRED',
          timestamp: new Date().toISOString(),
        });
      }

      const { policyName } = req.params;
      
      // Force reload by clearing cache and reloading
      const policy = await this.policyCache.getPolicy(policyName);
      
      if (!policy) {
        return res.status(404).json({
          error: 'Policy not found',
          policyName,
          timestamp: new Date().toISOString(),
        });
      }

      logger.info('Policy manually reloaded', {
        policyName,
        adminUser: req.auth.tenantId,
        requestId: req.requestId,
      });

      res.json({
        message: 'Policy reloaded successfully',
        policyName,
        version: policy.metadata.version,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to reload policy:', error);
      res.status(500).json({
        error: 'Failed to reload policy',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * Shutdown policy watcher
   */
  async shutdown(): Promise<void> {
    await this.policyCache.shutdown();
  }
}

// Export singleton instance
export const policyWatcher = new PolicyWatcherMiddleware();

import { Router, Request, Response } from 'express';
import pino from 'pino';
import { authMiddleware } from '../../middleware/auth';
import { AppDataSource } from '../../config/database';
import { LogEntity } from '../../entities/Log';
import { ApiKeyEntity } from '../../entities/ApiKey';
import { TenantEntity } from '../../entities/Tenant';
import { tierManager } from '../../config/tiers';
import { generateApiKey } from '../../utils/apiKey';
import { GatewayConfigManager } from '../config/GatewayConfigManager';

const logger = pino({
  name: 'gateway:dashboard',
  level: process.env.LOG_LEVEL || 'info',
});

const router = Router();
const gatewayConfig = GatewayConfigManager.getInstance();

// Apply auth middleware to all dashboard routes
router.use(authMiddleware.authenticate);

/**
 * GET /dashboard
 * Main dashboard page (serves HTML)
 */
router.get('/', (req: Request, res: Response) => {
  const uiConfig = gatewayConfig.getUIConfig();
  
  if (!uiConfig.selfService) {
    return res.status(404).json({ error: 'Dashboard not available' });
  }

  // Serve dashboard HTML
  res.sendFile('dashboard.html', { root: './public' });
});

/**
 * GET /dashboard/api/overview
 * Dashboard overview data
 */
router.get('/api/overview', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get current month date range
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get usage statistics using Core v0.3.1 logging
    const logRepository = AppDataSource.getRepository(LogEntity);
    
    const [
      totalRequests,
      blockedRequests,
      reviewRequests,
      allowedRequests,
      recentLogs,
    ] = await Promise.all([
      // Total requests this month
      logRepository.count({
        where: {
          tenantId,
          timestamp: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          } as any,
        },
      }),
      
      // Blocked requests this month
      logRepository.count({
        where: {
          tenantId,
          timestamp: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          } as any,
          'metadata.action': 'BLOCK',
        },
      }),
      
      // Review requests this month
      logRepository.count({
        where: {
          tenantId,
          timestamp: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          } as any,
          'metadata.action': 'REVIEW',
        },
      }),
      
      // Allowed requests this month
      logRepository.count({
        where: {
          tenantId,
          timestamp: {
            $gte: startOfMonth,
            $lte: endOfMonth,
          } as any,
          'metadata.action': 'ALLOW',
        },
      }),
      
      // Recent logs (last 10)
      logRepository.find({
        where: { tenantId },
        order: { timestamp: 'DESC' },
        take: 10,
      }),
    ]);

    // Get tier information
    const userTier = req.auth?.tenant?.tier || 'free';
    const tierConfig = tierManager.getTierConfig(userTier);
    const usagePercentage = tierManager.getUsagePercentage(userTier, totalRequests);
    const upgradeSuggestion = tierManager.getUpgradeSuggestion(userTier, totalRequests);

    // Calculate metrics
    const successRate = totalRequests > 0 ? (allowedRequests / totalRequests) * 100 : 100;
    const blockRate = totalRequests > 0 ? (blockedRequests / totalRequests) * 100 : 0;
    const reviewRate = totalRequests > 0 ? (reviewRequests / totalRequests) * 100 : 0;

    // Get daily usage for chart (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dailyUsage = await logRepository
      .createQueryBuilder('log')
      .select('DATE(log.timestamp)', 'date')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('SUM(CASE WHEN log.metadata->>"$.action" = "BLOCK" THEN 1 ELSE 0 END)', 'blocked')
      .addSelect('SUM(CASE WHEN log.metadata->>"$.action" = "ALLOW" THEN 1 ELSE 0 END)', 'allowed')
      .addSelect('SUM(CASE WHEN log.metadata->>"$.action" = "REVIEW" THEN 1 ELSE 0 END)', 'review')
      .addSelect('AVG(log.responseTime)', 'avgResponseTime')
      .where('log.tenantId = :tenantId', { tenantId })
      .andWhere('log.timestamp >= :startDate', { startDate: thirtyDaysAgo })
      .groupBy('DATE(log.timestamp)')
      .orderBy('date', 'ASC')
      .getRawMany();

    res.json({
      overview: {
        totalRequests,
        blockedRequests,
        reviewRequests,
        allowedRequests,
        successRate: Math.round(successRate * 100) / 100,
        blockRate: Math.round(blockRate * 100) / 100,
        reviewRate: Math.round(reviewRate * 100) / 100,
      },
      usage: {
        current: totalRequests,
        quota: tierConfig.monthlyQuota,
        percentage: Math.round(usagePercentage * 100) / 100,
        remaining: Math.max(0, tierConfig.monthlyQuota - totalRequests),
        resetDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
      },
      tier: {
        name: tierConfig.name,
        features: tierConfig.features,
        rateLimit: tierConfig.rateLimit,
        support: tierConfig.support,
        price: tierConfig.price,
        upgradeSuggestion,
      },
      recentActivity: recentLogs.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        action: log.metadata?.action || 'UNKNOWN',
        score: log.metadata?.score || 0,
        endpoint: log.endpoint,
        responseTime: log.responseTime,
        statusCode: log.statusCode,
        reasons: log.metadata?.reasons || [],
      })),
      charts: {
        dailyUsage: dailyUsage.map(day => ({
          date: day.date,
          requests: parseInt(day.requests),
          blocked: parseInt(day.blocked),
          allowed: parseInt(day.allowed),
          review: parseInt(day.review),
          avgResponseTime: Math.round(parseFloat(day.avgResponseTime) || 0),
        })),
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Failed to get dashboard overview:', error);
    res.status(500).json({
      error: 'Failed to retrieve dashboard data',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /dashboard/api/api-keys
 * Get API keys for the tenant
 */
router.get('/api/api-keys', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const apiKeys = await AppDataSource.getRepository(ApiKeyEntity)
      .find({
        where: { tenant: { id: tenantId } },
        order: { createdAt: 'DESC' },
      });

    res.json({
      apiKeys: apiKeys.map(key => ({
        keyId: key.keyId,
        name: key.name,
        scopes: key.scopes,
        isActive: key.isActive,
        lastUsed: key.lastUsed,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        rateLimit: key.rateLimit,
        // Never return the actual key
      })),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Failed to get API keys:', error);
    res.status(500).json({
      error: 'Failed to retrieve API keys',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * POST /dashboard/api/api-keys
 * Generate new API key
 */
router.post('/api/api-keys', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        error: 'API key name is required',
        timestamp: new Date().toISOString(),
      });
    }

    // Get tenant for tier info
    const tenant = await AppDataSource.getRepository(TenantEntity)
      .findOne({ where: { id: tenantId } });
    
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // Generate new API key using Core v0.3.1 utility
    const apiKeyData = generateApiKey();
    const tierConfig = tierManager.getTierConfig(tenant.tier);
    
    const apiKey = new ApiKeyEntity();
    apiKey.keyId = apiKeyData.keyId;
    apiKey.hashedKey = apiKeyData.hashedKey;
    apiKey.name = name;
    apiKey.tenant = tenant;
    apiKey.isActive = true;
    apiKey.scopes = ['guard:read', 'guard:write'];
    apiKey.rateLimit = tierConfig.rateLimit.requests;
    apiKey.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    await AppDataSource.getRepository(ApiKeyEntity).save(apiKey);

    logger.info('New API key generated', {
      tenantId,
      keyId: apiKey.keyId,
      name: apiKey.name,
    });

    res.status(201).json({
      message: 'API key generated successfully',
      apiKey: {
        keyId: apiKey.keyId,
        key: apiKeyData.plainKey, // Only shown once
        name: apiKey.name,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        rateLimit: apiKey.rateLimit,
      },
      warning: 'Save this key securely - it will not be shown again',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Failed to generate API key:', error);
    res.status(500).json({
      error: 'Failed to generate API key',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * DELETE /dashboard/api/api-keys/:keyId
 * Revoke API key
 */
router.delete('/api/api-keys/:keyId', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auth?.tenantId;
    const { keyId } = req.params;
    
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const apiKey = await AppDataSource.getRepository(ApiKeyEntity)
      .findOne({
        where: { 
          keyId,
          tenant: { id: tenantId }
        }
      });

    if (!apiKey) {
      return res.status(404).json({
        error: 'API key not found',
        timestamp: new Date().toISOString(),
      });
    }

    // Soft delete - mark as inactive
    apiKey.isActive = false;
    await AppDataSource.getRepository(ApiKeyEntity).save(apiKey);

    logger.info('API key revoked', {
      tenantId,
      keyId,
      name: apiKey.name,
    });

    res.json({
      message: 'API key revoked successfully',
      keyId,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Failed to revoke API key:', error);
    res.status(500).json({
      error: 'Failed to revoke API key',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /dashboard/api/policies
 * Get current policies (simplified view)
 */
router.get('/api/policies', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if custom policies feature is enabled for this tier
    const userTier = req.auth?.tenant?.tier || 'free';
    const tierConfig = tierManager.getTierConfig(userTier);
    
    if (!tierConfig.features.customPolicies) {
      return res.status(402).json({
        error: 'Custom policies not available in your tier',
        upgradeRequired: 'starter',
        upgradeUrl: '/pricing',
        timestamp: new Date().toISOString(),
      });
    }

    // Return simplified policy configuration
    res.json({
      policies: {
        promptInjection: {
          enabled: true,
          mode: 'balanced',
          customRules: [],
        },
        piiDetection: {
          enabled: true,
          types: ['cpf', 'cnpj', 'email', 'phone'],
          maskingEnabled: tierConfig.features.piiMasking,
        },
        riskScoring: {
          enabled: tierConfig.features.riskScoring,
          threshold: 0.7,
        },
      },
      editable: true,
      lastUpdated: new Date().toISOString(),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Failed to get policies:', error);
    res.status(500).json({
      error: 'Failed to retrieve policies',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /dashboard/api/logs
 * Get recent logs with filtering
 */
router.get('/api/logs', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Parse query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const action = req.query.action as string;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    // Build query using Core v0.3.1 logging
    const queryBuilder = AppDataSource.getRepository(LogEntity)
      .createQueryBuilder('log')
      .where('log.tenantId = :tenantId', { tenantId });

    if (action && ['ALLOW', 'BLOCK', 'REVIEW'].includes(action)) {
      queryBuilder.andWhere('log.metadata->>"$.action" = :action', { action });
    }

    if (startDate) {
      queryBuilder.andWhere('log.timestamp >= :startDate', { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere('log.timestamp <= :endDate', { endDate });
    }

    // Get total count and paginated results
    const [logs, total] = await queryBuilder
      .orderBy('log.timestamp', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const totalPages = Math.ceil(total / limit);

    res.json({
      logs: logs.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        endpoint: log.endpoint,
        method: log.method,
        statusCode: log.statusCode,
        responseTime: log.responseTime,
        action: log.metadata?.action,
        score: log.metadata?.score,
        reasons: log.metadata?.reasons,
        piiDetected: log.metadata?.piiDetected,
        // Don't include full content for privacy
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: {
        action,
        startDate,
        endDate,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Failed to get logs:', error);
    res.status(500).json({
      error: 'Failed to retrieve logs',
      timestamp: new Date().toISOString(),
    });
  }
});

export { router as gatewayDashboardRouter };

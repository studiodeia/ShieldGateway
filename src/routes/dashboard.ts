import { Router, Request, Response } from 'express';
import pino from 'pino';
import { AppDataSource } from '../config/database';
import { LogEntity } from '../entities/Log';
import { ApiKeyEntity } from '../entities/ApiKey';
import { tierManager } from '../config/tiers';
import { authMiddleware } from '../middleware/auth';

const logger = pino({
  name: 'gateway:dashboard',
  level: process.env.LOG_LEVEL || 'info',
});

const router = Router();

// Apply auth middleware to all dashboard routes
router.use(authMiddleware.authenticate);

/**
 * GET /dashboard/overview
 * Get dashboard overview data
 */
router.get('/overview', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get current month date range
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get usage statistics
    const logRepository = AppDataSource.getRepository(LogEntity);
    
    const [
      totalRequests,
      blockedRequests,
      reviewRequests,
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

    // Calculate success rate
    const successRequests = totalRequests - blockedRequests;
    const successRate = totalRequests > 0 ? (successRequests / totalRequests) * 100 : 100;

    // Get daily usage for chart (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dailyUsage = await logRepository
      .createQueryBuilder('log')
      .select('DATE(log.timestamp)', 'date')
      .addSelect('COUNT(*)', 'requests')
      .addSelect('SUM(CASE WHEN log.metadata->>"$.action" = "BLOCK" THEN 1 ELSE 0 END)', 'blocked')
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
        allowedRequests: totalRequests - blockedRequests - reviewRequests,
        successRate: Math.round(successRate * 100) / 100,
        blockRate: totalRequests > 0 ? Math.round((blockedRequests / totalRequests) * 10000) / 100 : 0,
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
        upgradeSuggestion,
      },
      recentActivity: recentLogs.map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        action: log.metadata?.action || 'UNKNOWN',
        riskScore: log.metadata?.riskScore || 0,
        endpoint: log.endpoint,
        responseTime: log.responseTime,
        statusCode: log.statusCode,
      })),
      charts: {
        dailyUsage: dailyUsage.map(day => ({
          date: day.date,
          requests: parseInt(day.requests),
          blocked: parseInt(day.blocked),
          allowed: parseInt(day.requests) - parseInt(day.blocked),
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
 * GET /dashboard/api-keys
 * Get API keys for the tenant
 */
router.get('/api-keys', async (req: Request, res: Response) => {
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
        isActive: key.active,
        lastUsed: key.lastUsedAt,
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
 * GET /dashboard/logs
 * Get recent logs with filtering
 */
router.get('/logs', async (req: Request, res: Response) => {
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

    // Build query
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
        riskScore: log.metadata?.riskScore,
        reasons: log.metadata?.reasons,
        piiDetected: log.metadata?.piiDetected,
        contentPreview: log.metadata?.contentPreview,
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

/**
 * GET /dashboard/analytics
 * Get analytics data for charts
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const tenantId = req.auth?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const period = req.query.period as string || '7d'; // 7d, 30d, 90d
    
    let daysBack = 7;
    if (period === '30d') daysBack = 30;
    if (period === '90d') daysBack = 90;

    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    // Get analytics data
    const logRepository = AppDataSource.getRepository(LogEntity);
    
    const [
      timeSeriesData,
      actionBreakdown,
      riskScoreDistribution,
      topEndpoints,
    ] = await Promise.all([
      // Time series data
      logRepository
        .createQueryBuilder('log')
        .select('DATE(log.timestamp)', 'date')
        .addSelect('COUNT(*)', 'total')
        .addSelect('SUM(CASE WHEN log.metadata->>"$.action" = "ALLOW" THEN 1 ELSE 0 END)', 'allowed')
        .addSelect('SUM(CASE WHEN log.metadata->>"$.action" = "BLOCK" THEN 1 ELSE 0 END)', 'blocked')
        .addSelect('SUM(CASE WHEN log.metadata->>"$.action" = "REVIEW" THEN 1 ELSE 0 END)', 'review')
        .addSelect('AVG(log.responseTime)', 'avgResponseTime')
        .where('log.tenantId = :tenantId', { tenantId })
        .andWhere('log.timestamp >= :startDate', { startDate })
        .groupBy('DATE(log.timestamp)')
        .orderBy('date', 'ASC')
        .getRawMany(),

      // Action breakdown
      logRepository
        .createQueryBuilder('log')
        .select('log.metadata->>"$.action"', 'action')
        .addSelect('COUNT(*)', 'count')
        .where('log.tenantId = :tenantId', { tenantId })
        .andWhere('log.timestamp >= :startDate', { startDate })
        .groupBy('log.metadata->>"$.action"')
        .getRawMany(),

      // Risk score distribution
      logRepository
        .createQueryBuilder('log')
        .select('CASE WHEN CAST(log.metadata->>"$.riskScore" AS DECIMAL) < 0.3 THEN "LOW" WHEN CAST(log.metadata->>"$.riskScore" AS DECIMAL) < 0.7 THEN "MEDIUM" ELSE "HIGH" END', 'riskLevel')
        .addSelect('COUNT(*)', 'count')
        .where('log.tenantId = :tenantId', { tenantId })
        .andWhere('log.timestamp >= :startDate', { startDate })
        .andWhere('log.metadata->>"$.riskScore" IS NOT NULL')
        .groupBy('riskLevel')
        .getRawMany(),

      // Top endpoints
      logRepository
        .createQueryBuilder('log')
        .select('log.endpoint', 'endpoint')
        .addSelect('COUNT(*)', 'requests')
        .addSelect('AVG(log.responseTime)', 'avgResponseTime')
        .addSelect('SUM(CASE WHEN log.metadata->>"$.action" = "BLOCK" THEN 1 ELSE 0 END)', 'blocked')
        .where('log.tenantId = :tenantId', { tenantId })
        .andWhere('log.timestamp >= :startDate', { startDate })
        .groupBy('log.endpoint')
        .orderBy('requests', 'DESC')
        .limit(10)
        .getRawMany(),
    ]);

    res.json({
      period,
      timeSeries: timeSeriesData.map(day => ({
        date: day.date,
        total: parseInt(day.total),
        allowed: parseInt(day.allowed),
        blocked: parseInt(day.blocked),
        review: parseInt(day.review),
        avgResponseTime: Math.round(parseFloat(day.avgResponseTime) || 0),
      })),
      actionBreakdown: actionBreakdown.map(item => ({
        action: item.action || 'UNKNOWN',
        count: parseInt(item.count),
      })),
      riskDistribution: riskScoreDistribution.map(item => ({
        level: item.riskLevel,
        count: parseInt(item.count),
      })),
      topEndpoints: topEndpoints.map(item => ({
        endpoint: item.endpoint,
        requests: parseInt(item.requests),
        avgResponseTime: Math.round(parseFloat(item.avgResponseTime) || 0),
        blocked: parseInt(item.blocked),
        blockRate: parseInt(item.requests) > 0 ? 
          Math.round((parseInt(item.blocked) / parseInt(item.requests)) * 10000) / 100 : 0,
      })),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Failed to get analytics:', error);
    res.status(500).json({
      error: 'Failed to retrieve analytics',
      timestamp: new Date().toISOString(),
    });
  }
});

export { router as dashboardRouter };

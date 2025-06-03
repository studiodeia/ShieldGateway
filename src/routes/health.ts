import { Router, Request, Response } from 'express';
import pino from 'pino';
import { QueueService } from '../services/QueueService';

const logger = pino({
  name: 'core:health',
  level: process.env.LOG_LEVEL || 'info',
});

const router = Router();

interface HealthResponse {
  status: 'ok' | 'degraded' | 'maintenance';
  version: string;
  uptime: number;
  timestamp: string;
  services: {
    database: 'ok' | 'error';
    s3: 'ok' | 'error';
    queue: 'ok' | 'error';
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    queueMetrics?: {
      waiting: number;
      active: number;
      completed: number;
      failed: number;
      delayed: number;
    };
  };
}

/**
 * @swagger
 * /v1/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the current health status of the GuardAgent Core service
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *             example:
 *               status: ok
 *               timestamp: "2024-06-02T10:30:00Z"
 *               version: "0.1.0"
 *               uptime: 3600
 *               services:
 *                 database: ok
 *                 s3: ok
 *                 memory:
 *                   used: 50000000
 *                   total: 100000000
 *                   percentage: 50
 *       503:
 *         description: Service is unhealthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const memUsage = process.memoryUsage();
    const memTotal = memUsage.heapTotal;
    const memUsed = memUsage.heapUsed;
    const memPercentage = Math.round((memUsed / memTotal) * 100);

    // Check queue health
    let queueStatus: 'ok' | 'error' = 'ok';
    let queueMetrics;

    try {
      const queueService = new QueueService();
      const healthCheck = await queueService.healthCheck();
      queueStatus = healthCheck.status;
      queueMetrics = healthCheck.metrics;
    } catch (error) {
      logger.warn('Queue health check failed:', error);
      queueStatus = 'error';
    }

    const services = {
      database: 'ok' as const,
      s3: 'ok' as const,
      queue: queueStatus,
      memory: {
        used: memUsed,
        total: memTotal,
        percentage: memPercentage,
      },
      queueMetrics,
    };

    const healthResponse: HealthResponse = {
      status: 'ok',
      version: process.env.npm_package_version || '0.1.0',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      services,
    };

    // Log health check for monitoring
    logger.debug('Health check requested', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      uptime: healthResponse.uptime,
    });

    res.status(200).json(healthResponse);
  } catch (error) {
    logger.error('Health check failed:', error);
    
    res.status(503).json({
      status: 'error',
      version: process.env.npm_package_version || '0.1.0',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

export { router as healthRouter };

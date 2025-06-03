import 'reflect-metadata';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import pino from 'pino';

import { healthRouter } from './routes/health';
import { guardRouter } from './routes/guard';
import { dpiaRouter } from './routes/dpia';
import { dsrRouter } from './routes/dsr';
import { docsRouter } from './routes/docs';
import { onboardingRouter } from './routes/onboarding';
import { dashboardRouter } from './routes/dashboard';
import { gatewayGuardRouter } from './gateway/routes/gatewayGuard';
import { gatewayDashboardRouter } from './gateway/routes/gatewayDashboard';
import { GatewayConfigManager } from './gateway/config/GatewayConfigManager';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { requestId } from './middleware/requestId';
import { legalBasisMiddleware } from './middleware/legalBasis';
import { metricsMiddleware, metricsHandler } from './middleware/metrics';
import { authMiddleware } from './middleware/auth';
import { rbacMiddleware } from './middleware/rbac';
import { riskGate } from './middleware/riskGate';
import { policyWatcher } from './middleware/policyWatcher';
import { featureGate } from './middleware/featureGate';
import { LogService } from './services/LogService';
import { QueueService } from './services/QueueService';
import { VaultService } from './services/VaultService';
import { MailService } from './services/MailService';
import { KeyRotationService } from './cron/rotateKeys';
import { PerformanceConfigManager } from './utils/performanceConfig';
import { initializeDatabase, closeDatabase } from './config/database';

const logger = pino({
  name: 'core:main',
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  }),
});

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Initialize services
const performanceConfig = PerformanceConfigManager.getInstance();
const gatewayConfig = GatewayConfigManager.getInstance();
const logService = new LogService();
const queueService = new QueueService();
const vaultService = VaultService.getInstance();
const mailService = MailService.getInstance();
const keyRotationService = KeyRotationService.getInstance();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Request ID, legal basis, and metrics
app.use(requestId);
app.use(legalBasisMiddleware);
app.use(metricsMiddleware);

// Feature gates and policy management
app.use(featureGate.middleware);
app.use(policyWatcher.middleware);
app.use(riskGate.middleware);

// Request parsing with error handling
app.use(express.json({
  limit: '10mb',
  strict: true,
  type: 'application/json'
}));
app.use(express.urlencoded({ extended: true }));

// JSON parsing error handler
app.use((error: any, req: any, res: any, next: any) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({
      error: 'Invalid JSON format',
      timestamp: new Date().toISOString(),
    });
  }
  next(error);
});

// Request logging with WORM integration (now async via queue)
app.use(requestLogger(logger, logService, queueService));

// Public routes (no authentication required)
app.use('/v1/health', healthRouter);
app.use('/docs', docsRouter);
app.get('/metrics', metricsHandler);
app.get('/.well-known/jwks.json', authMiddleware.jwks);

// Public routes (no auth required)
app.use('/start', onboardingRouter);
app.use('/pricing', featureGate.getPricing);
app.use('/docs', docsRouter);

// Static files
app.use(express.static('public'));

// API routes (auth required)
// Gateway mode: use simplified Gateway routes
if (gatewayConfig.getConfig().mode === 'gateway') {
  app.use('/v1/guard', gatewayGuardRouter);
} else {
  // Platform mode: use full Core routes
  app.use('/v1/guard', authMiddleware.authenticate, featureGate.checkQuota, rbacMiddleware.determineRole, guardRouter);
}

app.use('/v1/dpia', authMiddleware.authenticate, featureGate.requireFeature('customPolicies'), rbacMiddleware.determineRole, dpiaRouter);
app.use('/v1/dsr', authMiddleware.authenticate, rbacMiddleware.determineRole, dsrRouter);

// Dashboard routes (session auth)
// Gateway mode: use simplified Gateway dashboard
if (gatewayConfig.getConfig().mode === 'gateway') {
  app.use('/dashboard', gatewayDashboardRouter);
} else {
  // Platform mode: use full Core dashboard
  app.use('/dashboard', dashboardRouter);
}

app.use('/api/usage', featureGate.getUsageStats);

// WebSocket handling
wss.on('connection', (ws: WebSocket) => {
  logger.info('WebSocket connection established');

  ws.on('message', async (message: Buffer) => {
    try {
      const data = JSON.parse(message.toString());
      // TODO: Handle WebSocket guard requests
      ws.send(JSON.stringify({ status: 'received', data }));
    } catch (error) {
      logger.error('WebSocket message error:', error);
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket connection closed');
  });
});

// Error handling
app.use(errorHandler(logger));

// Initialize database and start server
async function startServer() {
  try {
    // Apply performance optimizations
    performanceConfig.applyRuntimeOptimizations();

    // Initialize core services
    await initializeDatabase();
    await queueService.initialize();
    await policyWatcher.initialize();
    await mailService.initialize();
    await keyRotationService.initialize();

    // Start key rotation scheduler
    keyRotationService.start();

    const PORT = parseInt(process.env.PORT || '8080', 10);
    const HOST = process.env.HOST || '0.0.0.0';

    server.listen(PORT, HOST, () => {
      logger.info(`GuardAgent Core server running on ${HOST}:${PORT}`);
      logger.info(`Health check: http://${HOST}:${PORT}/v1/health`);
      logger.info(`JWKS endpoint: http://${HOST}:${PORT}/.well-known/jwks.json`);
      logger.info(`Performance config applied for ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    keyRotationService.stop();
    await policyWatcher.shutdown();
    await queueService.shutdown();
    await closeDatabase();
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(async () => {
    keyRotationService.stop();
    await policyWatcher.shutdown();
    await queueService.shutdown();
    await closeDatabase();
    logger.info('Server closed');
    process.exit(0);
  });
});

export { app, server, logger };

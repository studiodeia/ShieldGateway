#!/usr/bin/env node

import { Job } from 'bullmq';
import pino from 'pino';
import { QueueService, LogJobData } from '../services/QueueService';
import { LogService } from '../services/LogService';
import { HashChainService } from '../services/HashChainService';
import { recordWormLog, recordLogWorkerProcessingTime, updateHashChainSequence } from '../middleware/metrics';

const logger = pino({
  name: 'core:log-worker',
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

class LogWorker {
  private queueService: QueueService;
  private logService: LogService;
  private hashChainService: HashChainService;
  private isShuttingDown = false;

  constructor() {
    this.queueService = new QueueService();
    this.logService = new LogService();
    this.hashChainService = new HashChainService();
  }

  /**
   * Initialize the worker
   */
  async initialize(): Promise<void> {
    try {
      await this.queueService.initialize();

      // Get chain statistics for monitoring
      const chainStats = await this.hashChainService.getChainStats();

      logger.info('Log worker initialized', {
        totalEntries: chainStats.totalEntries,
        lastSequenceNumber: chainStats.lastSequenceNumber,
        lastHash: chainStats.lastHash.substring(0, 8) + '...',
      });
    } catch (error) {
      logger.error('Failed to initialize log worker:', error);
      throw error;
    }
  }

  /**
   * Start processing log jobs
   */
  start(): void {
    const worker = this.queueService.createLogWorker(this.processLogJob.bind(this));

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown(worker));
    process.on('SIGINT', () => this.shutdown(worker));

    logger.info('Log worker started and listening for jobs');
  }

  /**
   * Process individual log job
   */
  private async processLogJob(job: Job<LogJobData>): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Worker is shutting down');
    }

    const startTime = Date.now();
    const logData = job.data;

    try {
      // Write to WORM storage first
      const s3Key = await this.logService.writeLog(
        logData.requestId,
        logData.method,
        logData.url,
        logData.statusCode,
        logData.responseTime,
        logData.userAgent,
        logData.ip,
        logData.tenantId,
        logData.complianceMetadata
      );

      // Add to hash chain atomically (thread-safe)
      const chainEntry = await this.hashChainService.addChainEntry(logData, s3Key);

      const processingTime = Date.now() - startTime;

      // Record metrics
      recordWormLog('success');
      recordLogWorkerProcessingTime(processingTime);
      updateHashChainSequence(chainEntry.sequenceNumber);

      logger.debug('Log entry processed successfully', {
        requestId: logData.requestId,
        sequenceNumber: chainEntry.sequenceNumber,
        processingTime,
        chainHash: chainEntry.currentHash.substring(0, 8) + '...',
      });

      // Check if processing time exceeds SLA
      if (processingTime > 150) {
        logger.warn('Log processing exceeded SLA', {
          requestId: logData.requestId,
          processingTime,
          slaTarget: 150,
        });
      }

    } catch (error) {
      recordWormLog('error');

      logger.error('Failed to process log entry', {
        requestId: logData.requestId,
        error: error.message,
        jobId: job.id,
        attempts: job.attemptsMade,
      });

      throw error;
    }
  }



  /**
   * Graceful shutdown
   */
  private async shutdown(worker: any): Promise<void> {
    if (this.isShuttingDown) return;
    
    this.isShuttingDown = true;
    logger.info('Shutting down log worker gracefully...');

    try {
      // Stop accepting new jobs
      await worker.close();
      
      // Shutdown queue service
      await this.queueService.shutdown();
      
      logger.info('Log worker shut down successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during worker shutdown:', error);
      process.exit(1);
    }
  }
}

// Start the worker if this file is run directly
if (require.main === module) {
  const worker = new LogWorker();
  
  worker.initialize()
    .then(() => {
      worker.start();
    })
    .catch((error) => {
      logger.error('Failed to start log worker:', error);
      process.exit(1);
    });
}

export { LogWorker };

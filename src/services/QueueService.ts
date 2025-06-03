import { Queue, Worker, Job, QueueOptions, WorkerOptions } from 'bullmq';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import IORedis from 'ioredis';
import pino from 'pino';

const logger = pino({
  name: 'core:queue-service',
  level: process.env.LOG_LEVEL || 'info',
});

export interface LogJobData {
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  ip: string;
  tenantId?: string;
  complianceMetadata: any;
  timestamp: string;
  prevHash?: string;
}

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export class QueueService {
  private redis: IORedis;
  private logQueue: Queue<LogJobData>;
  private sqsClient?: SQSClient;
  private dlqUrl?: string;
  private isInitialized = false;

  constructor() {
    // Initialize Redis connection
    this.redis = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    // Initialize SQS for DLQ (if configured)
    if (process.env.AWS_REGION && process.env.DLQ_URL) {
      this.sqsClient = new SQSClient({
        region: process.env.AWS_REGION,
      });
      this.dlqUrl = process.env.DLQ_URL;
    }

    // Queue configuration
    const queueOptions: QueueOptions = {
      connection: this.redis,
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50,      // Keep last 50 failed jobs
        attempts: 5,           // Retry up to 5 times
        backoff: {
          type: 'exponential',
          delay: 2000,         // Start with 2 second delay
        },
      },
    };

    this.logQueue = new Queue<LogJobData>('log-processing', queueOptions);
  }

  /**
   * Initialize the queue service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.redis.connect();
      logger.info('Redis connection established');

      // Test queue connectivity
      await this.logQueue.add('test', { 
        requestId: 'test',
        method: 'GET',
        url: '/test',
        statusCode: 200,
        responseTime: 0,
        ip: '127.0.0.1',
        timestamp: new Date().toISOString(),
        complianceMetadata: {},
      });

      this.isInitialized = true;
      logger.info('Queue service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize queue service:', error);
      throw error;
    }
  }

  /**
   * Add log entry to processing queue
   */
  async enqueueLog(logData: LogJobData): Promise<void> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      await this.logQueue.add('process-log', logData, {
        priority: this.getLogPriority(logData),
        delay: 0, // Process immediately
      });

      logger.debug('Log entry queued', {
        requestId: logData.requestId,
        method: logData.method,
        url: logData.url,
      });
    } catch (error) {
      logger.error('Failed to enqueue log:', error);
      
      // Fallback to DLQ if available
      if (this.sqsClient && this.dlqUrl) {
        await this.sendToDLQ(logData, error);
      }
      
      throw error;
    }
  }

  /**
   * Create worker for processing log jobs
   */
  createLogWorker(processor: (job: Job<LogJobData>) => Promise<void>): Worker<LogJobData> {
    const workerOptions: WorkerOptions = {
      connection: this.redis,
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5'),
      maxStalledCount: 3,
      stalledInterval: 30000, // 30 seconds
    };

    const worker = new Worker<LogJobData>('log-processing', async (job: Job<LogJobData>) => {
      const startTime = Date.now();
      
      try {
        await processor(job);
        
        const processingTime = Date.now() - startTime;
        logger.debug('Log job processed successfully', {
          jobId: job.id,
          requestId: job.data.requestId,
          processingTime,
        });
      } catch (error) {
        logger.error('Log job processing failed', {
          jobId: job.id,
          requestId: job.data.requestId,
          error,
        });

        // Send to DLQ on final failure
        if (job.attemptsMade >= (job.opts.attempts || 5)) {
          if (this.sqsClient && this.dlqUrl) {
            await this.sendToDLQ(job.data, error);
          }
        }
        
        throw error;
      }
    }, workerOptions);

    // Worker event handlers
    worker.on('completed', (job) => {
      logger.debug('Job completed', { jobId: job.id });
    });

    worker.on('failed', (job, err) => {
      logger.warn('Job failed', { 
        jobId: job?.id, 
        error: err.message,
        attempts: job?.attemptsMade,
      });
    });

    worker.on('stalled', (jobId) => {
      logger.warn('Job stalled', { jobId });
    });

    return worker;
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    const waiting = await this.logQueue.getWaiting();
    const active = await this.logQueue.getActive();
    const completed = await this.logQueue.getCompleted();
    const failed = await this.logQueue.getFailed();
    const delayed = await this.logQueue.getDelayed();

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    };
  }

  /**
   * Check queue health
   */
  async healthCheck(): Promise<{ status: 'ok' | 'error'; metrics: QueueMetrics }> {
    try {
      const metrics = await this.getMetrics();
      
      // Consider unhealthy if too many failed jobs
      const status = metrics.failed > 100 ? 'error' : 'ok';
      
      return { status, metrics };
    } catch (error) {
      logger.error('Queue health check failed:', error);
      return { 
        status: 'error', 
        metrics: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 }
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      await this.logQueue.close();
      await this.redis.disconnect();
      logger.info('Queue service shut down gracefully');
    } catch (error) {
      logger.error('Error during queue shutdown:', error);
    }
  }

  /**
   * Determine log priority based on data
   */
  private getLogPriority(logData: LogJobData): number {
    // Higher priority for errors and security events
    if (logData.statusCode >= 500) return 1; // High priority
    if (logData.statusCode >= 400) return 2; // Medium priority
    if (logData.url.includes('/guard')) return 2; // Security events
    return 3; // Normal priority
  }

  /**
   * Send failed job to Dead Letter Queue
   */
  private async sendToDLQ(logData: LogJobData, error: any): Promise<void> {
    if (!this.sqsClient || !this.dlqUrl) return;

    try {
      const message = {
        logData,
        error: error.message,
        timestamp: new Date().toISOString(),
        source: 'guardagent-log-queue',
      };

      await this.sqsClient.send(new SendMessageCommand({
        QueueUrl: this.dlqUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          'source': {
            DataType: 'String',
            StringValue: 'guardagent-log-queue',
          },
          'requestId': {
            DataType: 'String',
            StringValue: logData.requestId,
          },
        },
      }));

      logger.info('Log data sent to DLQ', {
        requestId: logData.requestId,
        dlqUrl: this.dlqUrl,
      });
    } catch (dlqError) {
      logger.error('Failed to send to DLQ:', dlqError);
    }
  }
}

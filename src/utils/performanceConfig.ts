import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import pino from 'pino';

const logger = pino({
  name: 'core:performance-config',
  level: process.env.LOG_LEVEL || 'info',
});

export interface PerformanceConfig {
  runtime: {
    maxOldSpaceSize: number;
    maxSemiSpaceSize: number;
    gcType: string;
    exposeGC: boolean;
    uvThreadpoolSize: number;
    optimizeForSize: boolean;
    maxInlinedSourceSize: number;
  };
  database: {
    postgresql: {
      max: number;
      min: number;
      idle: number;
      acquire: number;
      evict: number;
      statementTimeout: number;
      queryTimeout: number;
      connectionTimeout: number;
      ssl: boolean;
      keepAlive: boolean;
      keepAliveInitialDelayMs: number;
    };
  };
  redis: {
    maxRetriesPerRequest: number;
    retryDelayOnFailover: number;
    enableOfflineQueue: boolean;
    lazyConnect: boolean;
    maxConnections: number;
    minConnections: number;
    keepAlive: number;
    commandTimeout: number;
    maxMemoryPolicy: string;
  };
  server: {
    keepAliveTimeout: number;
    headersTimeout: number;
    requestTimeout: number;
    maxConnections: number;
    maxRequestsPerSocket: number;
    compression: {
      enabled: boolean;
      level: number;
      threshold: number;
    };
    bodyLimit: string;
    jsonLimit: string;
    textLimit: string;
  };
  queue: {
    redis: {
      maxRetriesPerRequest: number;
      retryDelayOnFailover: number;
      lazyConnect: boolean;
    };
    concurrency: number;
    maxStalledCount: number;
    stalledInterval: number;
    removeOnComplete: number;
    removeOnFail: number;
    limiter: {
      max: number;
      duration: number;
    };
  };
  cache: {
    policies: {
      ttl: number;
      maxSize: number;
    };
    riskWeights: {
      ttl: number;
    };
    jwtVerification: {
      ttl: number;
      maxSize: number;
    };
  };
  monitoring: {
    prometheus: {
      enabled: boolean;
      collectDefaultMetrics: boolean;
      defaultLabels: Record<string, string>;
    };
    healthCheck: {
      interval: number;
      timeout: number;
    };
    performanceMonitoring: {
      enabled: boolean;
      sampleRate: number;
      slowRequestThreshold: number;
    };
  };
  security: {
    rateLimit: {
      windowMs: number;
      max: number;
      standardHeaders: boolean;
      legacyHeaders: boolean;
    };
    cors: {
      maxAge: number;
    };
    helmet: {
      contentSecurityPolicy: boolean;
      crossOriginEmbedderPolicy: boolean;
    };
  };
  loadBalancer: {
    healthCheckPath: string;
    healthCheckInterval: number;
    keepAlive: boolean;
    keepAliveTimeout: number;
    stickySession: boolean;
  };
  aws: {
    s3: {
      maxRetries: number;
      retryDelayOptions: {
        base: number;
      };
      httpOptions: {
        timeout: number;
        connectTimeout: number;
      };
    };
    kms: {
      maxRetries: number;
      httpOptions: {
        timeout: number;
        connectTimeout: number;
      };
    };
  };
  logging: {
    level: string;
    async: boolean;
    rotation: {
      enabled: boolean;
      maxFiles: number;
      maxSize: string;
    };
    structured: boolean;
    timestamp: boolean;
    redact: string[];
  };
  environments: Record<string, any>;
}

export class PerformanceConfigManager {
  private static instance: PerformanceConfigManager;
  private config: PerformanceConfig;
  private configPath: string;

  private constructor() {
    this.configPath = process.env.PERFORMANCE_CONFIG_PATH || 
                     path.resolve(__dirname, '../../config/performance.yaml');
    this.loadConfig();
  }

  static getInstance(): PerformanceConfigManager {
    if (!PerformanceConfigManager.instance) {
      PerformanceConfigManager.instance = new PerformanceConfigManager();
    }
    return PerformanceConfigManager.instance;
  }

  /**
   * Load performance configuration
   */
  private loadConfig(): void {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      this.config = yaml.load(configContent) as PerformanceConfig;
      
      // Apply environment-specific overrides
      this.applyEnvironmentOverrides();
      
      logger.info('Performance configuration loaded', {
        environment: process.env.NODE_ENV,
        configPath: this.configPath,
      });
    } catch (error) {
      logger.error('Failed to load performance configuration:', error);
      
      // Use default configuration
      this.config = this.getDefaultConfig();
      logger.warn('Using default performance configuration');
    }
  }

  /**
   * Apply environment-specific configuration overrides
   */
  private applyEnvironmentOverrides(): void {
    const environment = process.env.NODE_ENV || 'development';
    const envOverrides = this.config.environments?.[environment];
    
    if (envOverrides) {
      this.config = this.deepMerge(this.config, envOverrides);
      logger.debug('Applied environment-specific overrides', { environment });
    }
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): PerformanceConfig {
    return {
      runtime: {
        maxOldSpaceSize: 768,
        maxSemiSpaceSize: 64,
        gcType: 'incremental',
        exposeGC: false,
        uvThreadpoolSize: 16,
        optimizeForSize: false,
        maxInlinedSourceSize: 600,
      },
      database: {
        postgresql: {
          max: 50,
          min: 10,
          idle: 10000,
          acquire: 60000,
          evict: 1000,
          statementTimeout: 30000,
          queryTimeout: 25000,
          connectionTimeout: 10000,
          ssl: false,
          keepAlive: true,
          keepAliveInitialDelayMs: 0,
        },
      },
      redis: {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableOfflineQueue: false,
        lazyConnect: true,
        maxConnections: 20,
        minConnections: 5,
        keepAlive: 30000,
        commandTimeout: 5000,
        maxMemoryPolicy: 'allkeys-lru',
      },
      server: {
        keepAliveTimeout: 5000,
        headersTimeout: 6000,
        requestTimeout: 30000,
        maxConnections: 1000,
        maxRequestsPerSocket: 0,
        compression: {
          enabled: true,
          level: 6,
          threshold: 1024,
        },
        bodyLimit: '1mb',
        jsonLimit: '1mb',
        textLimit: '1mb',
      },
      queue: {
        redis: {
          maxRetriesPerRequest: 3,
          retryDelayOnFailover: 100,
          lazyConnect: true,
        },
        concurrency: 5,
        maxStalledCount: 3,
        stalledInterval: 30000,
        removeOnComplete: 100,
        removeOnFail: 50,
        limiter: {
          max: 3000,
          duration: 1000,
        },
      },
      cache: {
        policies: {
          ttl: 3600,
          maxSize: 100,
        },
        riskWeights: {
          ttl: 1800,
        },
        jwtVerification: {
          ttl: 300,
          maxSize: 1000,
        },
      },
      monitoring: {
        prometheus: {
          enabled: true,
          collectDefaultMetrics: true,
          defaultLabels: {
            service: 'guardagent-core',
            environment: process.env.NODE_ENV || 'development',
          },
        },
        healthCheck: {
          interval: 30000,
          timeout: 5000,
        },
        performanceMonitoring: {
          enabled: true,
          sampleRate: 0.1,
          slowRequestThreshold: 1000,
        },
      },
      security: {
        rateLimit: {
          windowMs: 60000,
          max: 1000,
          standardHeaders: true,
          legacyHeaders: false,
        },
        cors: {
          maxAge: 86400,
        },
        helmet: {
          contentSecurityPolicy: false,
          crossOriginEmbedderPolicy: false,
        },
      },
      loadBalancer: {
        healthCheckPath: '/v1/health',
        healthCheckInterval: 10,
        keepAlive: true,
        keepAliveTimeout: 5000,
        stickySession: false,
      },
      aws: {
        s3: {
          maxRetries: 3,
          retryDelayOptions: {
            base: 300,
          },
          httpOptions: {
            timeout: 10000,
            connectTimeout: 5000,
          },
        },
        kms: {
          maxRetries: 3,
          httpOptions: {
            timeout: 5000,
            connectTimeout: 2000,
          },
        },
      },
      logging: {
        level: 'info',
        async: true,
        rotation: {
          enabled: true,
          maxFiles: 5,
          maxSize: '100m',
        },
        structured: true,
        timestamp: true,
        redact: ['password', 'token', 'apiKey', 'authorization'],
      },
      environments: {},
    };
  }

  /**
   * Get configuration section
   */
  getConfig(): PerformanceConfig {
    return this.config;
  }

  /**
   * Get database configuration
   */
  getDatabaseConfig() {
    return this.config.database.postgresql;
  }

  /**
   * Get Redis configuration
   */
  getRedisConfig() {
    return this.config.redis;
  }

  /**
   * Get server configuration
   */
  getServerConfig() {
    return this.config.server;
  }

  /**
   * Get queue configuration
   */
  getQueueConfig() {
    return this.config.queue;
  }

  /**
   * Get cache configuration
   */
  getCacheConfig() {
    return this.config.cache;
  }

  /**
   * Get monitoring configuration
   */
  getMonitoringConfig() {
    return this.config.monitoring;
  }

  /**
   * Apply Node.js runtime optimizations
   */
  applyRuntimeOptimizations(): void {
    const runtime = this.config.runtime;
    
    // Set UV_THREADPOOL_SIZE for libuv
    process.env.UV_THREADPOOL_SIZE = runtime.uvThreadpoolSize.toString();
    
    logger.info('Runtime optimizations applied', {
      uvThreadpoolSize: runtime.uvThreadpoolSize,
      maxOldSpaceSize: runtime.maxOldSpaceSize,
    });
  }

  /**
   * Get Node.js startup flags
   */
  getNodeFlags(): string[] {
    const runtime = this.config.runtime;
    const flags: string[] = [];
    
    flags.push(`--max-old-space-size=${runtime.maxOldSpaceSize}`);
    flags.push(`--max-semi-space-size=${runtime.maxSemiSpaceSize}`);
    
    if (runtime.exposeGC) {
      flags.push('--expose-gc');
    }
    
    if (runtime.optimizeForSize) {
      flags.push('--optimize-for-size');
    }
    
    flags.push(`--max-inlined-source-size=${runtime.maxInlinedSourceSize}`);
    
    return flags;
  }
}

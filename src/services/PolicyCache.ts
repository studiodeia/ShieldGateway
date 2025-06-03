import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chokidar from 'chokidar';
import IORedis from 'ioredis';
import pino from 'pino';
import { createHash } from 'crypto';

const logger = pino({
  name: 'core:policy-cache',
  level: process.env.LOG_LEVEL || 'info',
});

export interface PolicyConfig {
  metadata: {
    name: string;
    version: string;
    description: string;
    lastUpdated: string;
    maintainer: string;
    applicableRegions?: string[];
  };
  promptInjection: {
    enabled: boolean;
    strictMode: boolean;
    confidence: {
      block: number;
      warn: number;
      log: number;
    };
    patterns: Array<{
      pattern: string;
      confidence: number;
      description: string;
    }>;
  };
  dataSensitivity: {
    enabled: boolean;
    categories: Record<string, {
      weight: number;
      patterns: string[];
      keywords: string[];
    }>;
  };
  contentFiltering: {
    enabled: boolean;
    blockedContent: Array<{
      type: string;
      action: string;
      patterns: string[];
    }>;
  };
  rateLimiting: {
    enabled: boolean;
    rules: Array<{
      contentType: string;
      requests: number;
      window: number;
      action: string;
    }>;
  };
  actions: Record<string, {
    enabled: boolean;
    message?: string;
    logLevel: string;
    notifyAdmin: boolean;
  }>;
  integrations: {
    dpia: {
      autoGenerate: boolean;
      threshold: number;
    };
    dsr: {
      autoLog: boolean;
      categories: string[];
    };
    notifications: {
      email: {
        enabled: boolean;
        recipients: string[];
        threshold: number;
      };
      webhook: {
        enabled: boolean;
        url?: string;
        threshold: number;
      };
    };
  };
  compliance: {
    lgpd: {
      enabled: boolean;
      legalBasis: {
        required: boolean;
        validBases: string[];
      };
    };
    gdpr: {
      enabled: boolean;
      dataSubjectRights: boolean;
      rightToErasure: boolean;
      dataPortability: boolean;
    };
  };
  audit: {
    enabled: boolean;
    logAllRequests: boolean;
    retentionDays: number;
    includeContent: boolean;
    includeRiskScore: boolean;
  };
}

export class PolicyCache {
  private static instance: PolicyCache;
  private redis: IORedis;
  private policiesPath: string;
  private watcher: chokidar.FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private policies: Map<string, PolicyConfig> = new Map();
  private checksums: Map<string, string> = new Map();

  private constructor() {
    this.policiesPath = process.env.POLICIES_PATH || path.resolve(__dirname, '../../config/policies');
    
    // Initialize Redis connection
    this.redis = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '1'), // Use different DB for policies
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }

  static getInstance(): PolicyCache {
    if (!PolicyCache.instance) {
      PolicyCache.instance = new PolicyCache();
    }
    return PolicyCache.instance;
  }

  /**
   * Initialize policy cache
   */
  async initialize(): Promise<void> {
    try {
      await this.redis.connect();
      await this.loadAllPolicies();
      this.startWatching();
      
      logger.info('Policy cache initialized successfully', {
        policiesPath: this.policiesPath,
        policiesLoaded: this.policies.size,
      });
    } catch (error) {
      logger.error('Failed to initialize policy cache:', error);
      throw error;
    }
  }

  /**
   * Load all policies from filesystem
   */
  private async loadAllPolicies(): Promise<void> {
    try {
      if (!fs.existsSync(this.policiesPath)) {
        logger.warn(`Policies directory does not exist: ${this.policiesPath}`);
        return;
      }

      const files = fs.readdirSync(this.policiesPath);
      const yamlFiles = files.filter(file => file.endsWith('.yaml') || file.endsWith('.yml'));

      for (const file of yamlFiles) {
        await this.loadPolicy(file);
      }

      logger.info(`Loaded ${yamlFiles.length} policy files`);
    } catch (error) {
      logger.error('Failed to load policies:', error);
      throw error;
    }
  }

  /**
   * Load individual policy file
   */
  private async loadPolicy(filename: string): Promise<void> {
    try {
      const filePath = path.join(this.policiesPath, filename);
      const content = fs.readFileSync(filePath, 'utf8');
      const checksum = createHash('sha256').update(content).digest('hex');
      
      // Check if policy has changed
      const existingChecksum = this.checksums.get(filename);
      if (existingChecksum === checksum) {
        logger.debug(`Policy ${filename} unchanged, skipping reload`);
        return;
      }

      const policy = yaml.load(content) as PolicyConfig;
      
      // Validate policy structure
      this.validatePolicy(policy, filename);
      
      // Store in memory cache
      this.policies.set(filename, policy);
      this.checksums.set(filename, checksum);
      
      // Store in Redis cache with TTL
      const redisKey = `policy:${filename}`;
      await this.redis.setex(redisKey, 3600, JSON.stringify({
        policy,
        checksum,
        lastModified: new Date().toISOString(),
      }));

      logger.info(`Policy loaded: ${filename}`, {
        name: policy.metadata.name,
        version: policy.metadata.version,
        checksum: checksum.substring(0, 8),
      });
    } catch (error) {
      logger.error(`Failed to load policy ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Validate policy structure
   */
  private validatePolicy(policy: PolicyConfig, filename: string): void {
    if (!policy.metadata?.name) {
      throw new Error(`Policy ${filename} missing metadata.name`);
    }
    
    if (!policy.metadata?.version) {
      throw new Error(`Policy ${filename} missing metadata.version`);
    }
    
    if (typeof policy.promptInjection?.enabled !== 'boolean') {
      throw new Error(`Policy ${filename} missing or invalid promptInjection.enabled`);
    }
    
    if (typeof policy.dataSensitivity?.enabled !== 'boolean') {
      throw new Error(`Policy ${filename} missing or invalid dataSensitivity.enabled`);
    }
    
    // Additional validation can be added here
    logger.debug(`Policy ${filename} validation passed`);
  }

  /**
   * Start watching for file changes
   */
  private startWatching(): void {
    if (this.watcher) {
      this.watcher.close();
    }

    this.watcher = chokidar.watch(this.policiesPath, {
      ignored: /[\/\\]\./,
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on('change', (filePath) => this.handleFileChange(filePath))
      .on('add', (filePath) => this.handleFileChange(filePath))
      .on('unlink', (filePath) => this.handleFileDelete(filePath))
      .on('error', (error) => logger.error('Policy watcher error:', error));

    logger.info('Policy file watcher started', { path: this.policiesPath });
  }

  /**
   * Handle file change with debouncing
   */
  private handleFileChange(filePath: string): void {
    const filename = path.basename(filePath);
    
    if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
      return;
    }

    // Clear existing debounce timer
    const existingTimer = this.debounceTimers.get(filename);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new debounce timer (2 seconds)
    const timer = setTimeout(async () => {
      try {
        logger.info(`Policy file changed: ${filename}`);
        await this.loadPolicy(filename);
        this.debounceTimers.delete(filename);
      } catch (error) {
        logger.error(`Failed to reload policy ${filename}:`, error);
      }
    }, 2000);

    this.debounceTimers.set(filename, timer);
  }

  /**
   * Handle file deletion
   */
  private handleFileDelete(filePath: string): void {
    const filename = path.basename(filePath);
    
    if (!filename.endsWith('.yaml') && !filename.endsWith('.yml')) {
      return;
    }

    logger.info(`Policy file deleted: ${filename}`);
    
    // Remove from caches
    this.policies.delete(filename);
    this.checksums.delete(filename);
    
    // Remove from Redis
    const redisKey = `policy:${filename}`;
    this.redis.del(redisKey).catch(error => {
      logger.error(`Failed to delete policy from Redis: ${filename}`, error);
    });
  }

  /**
   * Get policy by name
   */
  async getPolicy(name: string = 'lgpd-default.yaml'): Promise<PolicyConfig | null> {
    try {
      // Try memory cache first
      const memoryPolicy = this.policies.get(name);
      if (memoryPolicy) {
        return memoryPolicy;
      }

      // Try Redis cache
      const redisKey = `policy:${name}`;
      const redisData = await this.redis.get(redisKey);
      if (redisData) {
        const parsed = JSON.parse(redisData);
        this.policies.set(name, parsed.policy);
        return parsed.policy;
      }

      // Try loading from filesystem
      if (fs.existsSync(path.join(this.policiesPath, name))) {
        await this.loadPolicy(name);
        return this.policies.get(name) || null;
      }

      logger.warn(`Policy not found: ${name}`);
      return null;
    } catch (error) {
      logger.error(`Failed to get policy ${name}:`, error);
      return null;
    }
  }

  /**
   * Get all available policies
   */
  getAllPolicies(): Map<string, PolicyConfig> {
    return new Map(this.policies);
  }

  /**
   * Get policy metadata
   */
  getPolicyMetadata(): Array<{ name: string; metadata: PolicyConfig['metadata']; checksum: string }> {
    const result: Array<{ name: string; metadata: PolicyConfig['metadata']; checksum: string }> = [];
    
    for (const [name, policy] of this.policies) {
      result.push({
        name,
        metadata: policy.metadata,
        checksum: this.checksums.get(name) || '',
      });
    }
    
    return result;
  }

  /**
   * Shutdown policy cache
   */
  async shutdown(): Promise<void> {
    try {
      if (this.watcher) {
        await this.watcher.close();
      }
      
      // Clear debounce timers
      for (const timer of this.debounceTimers.values()) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();
      
      await this.redis.disconnect();
      
      logger.info('Policy cache shut down successfully');
    } catch (error) {
      logger.error('Error during policy cache shutdown:', error);
    }
  }
}

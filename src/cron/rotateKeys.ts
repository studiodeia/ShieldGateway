#!/usr/bin/env node

import cron from 'node-cron';
import { generateKeyPairSync } from 'crypto';
import pino from 'pino';
import { VaultService } from '../services/VaultService';
import { MailService, AlertContext } from '../services/MailService';

const logger = pino({
  name: 'core:key-rotation',
  level: process.env.LOG_LEVEL || 'info',
});

export interface KeyRotationConfig {
  enabled: boolean;
  schedule: string; // Cron expression
  keySize: number;
  retentionDays: number;
  notifyOnRotation: boolean;
  dryRun: boolean;
}

export interface JWTKeyPair {
  privateKey: string;
  publicKey: string;
  keyId: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'deprecated' | 'revoked';
}

export class KeyRotationService {
  private static instance: KeyRotationService;
  private config: KeyRotationConfig;
  private vaultService: VaultService;
  private mailService: MailService;
  private cronJob: cron.ScheduledTask | null = null;

  private constructor() {
    this.config = {
      enabled: process.env.KEY_ROTATION_ENABLED !== 'false',
      schedule: process.env.KEY_ROTATION_SCHEDULE || '0 2 1 * *', // 1st day of month at 2 AM
      keySize: parseInt(process.env.JWT_KEY_SIZE || '2048'),
      retentionDays: parseInt(process.env.KEY_RETENTION_DAYS || '30'),
      notifyOnRotation: process.env.KEY_ROTATION_NOTIFY !== 'false',
      dryRun: process.env.KEY_ROTATION_DRY_RUN === 'true',
    };

    this.vaultService = VaultService.getInstance();
    this.mailService = MailService.getInstance();
  }

  static getInstance(): KeyRotationService {
    if (!KeyRotationService.instance) {
      KeyRotationService.instance = new KeyRotationService();
    }
    return KeyRotationService.instance;
  }

  /**
   * Initialize key rotation service
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Key rotation disabled');
      return;
    }

    try {
      await this.mailService.initialize();
      
      // Validate cron schedule
      if (!cron.validate(this.config.schedule)) {
        throw new Error(`Invalid cron schedule: ${this.config.schedule}`);
      }

      // Schedule the rotation job
      this.cronJob = cron.schedule(this.config.schedule, async () => {
        await this.performRotation();
      }, {
        scheduled: false, // Don't start immediately
        timezone: process.env.TZ || 'UTC',
      });

      logger.info('Key rotation service initialized', {
        schedule: this.config.schedule,
        keySize: this.config.keySize,
        retentionDays: this.config.retentionDays,
        dryRun: this.config.dryRun,
      });
    } catch (error) {
      logger.error('Failed to initialize key rotation service:', error);
      throw error;
    }
  }

  /**
   * Start the rotation scheduler
   */
  start(): void {
    if (!this.config.enabled || !this.cronJob) {
      logger.info('Key rotation not started (disabled or not initialized)');
      return;
    }

    this.cronJob.start();
    logger.info('Key rotation scheduler started', {
      schedule: this.config.schedule,
    });
  }

  /**
   * Stop the rotation scheduler
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('Key rotation scheduler stopped');
    }
  }

  /**
   * Perform key rotation
   */
  async performRotation(): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Starting JWT key rotation', {
        dryRun: this.config.dryRun,
      });

      // Get current keys
      const currentKeys = await this.getCurrentKeys();
      
      // Generate new key pair
      const newKeyPair = this.generateNewKeyPair();
      
      if (this.config.dryRun) {
        logger.info('DRY RUN: Would rotate keys', {
          currentKeyCount: currentKeys.length,
          newKeyId: newKeyPair.keyId,
        });
        return;
      }

      // Store new key pair in Vault
      await this.storeNewKeyPair(newKeyPair);
      
      // Mark current keys as deprecated
      await this.deprecateCurrentKeys(currentKeys);
      
      // Clean up old keys
      await this.cleanupOldKeys();
      
      const duration = Date.now() - startTime;
      
      logger.info('JWT key rotation completed successfully', {
        newKeyId: newKeyPair.keyId,
        duration,
        deprecatedKeys: currentKeys.length,
      });

      // Send notification if enabled
      if (this.config.notifyOnRotation) {
        await this.sendRotationNotification(newKeyPair, currentKeys, duration);
      }

    } catch (error) {
      logger.error('Key rotation failed:', error);
      
      // Send failure notification
      await this.sendFailureNotification(error);
      
      throw error;
    }
  }

  /**
   * Get current active keys from Vault
   */
  private async getCurrentKeys(): Promise<JWTKeyPair[]> {
    try {
      const secret = await this.vaultService.readSecret('jwt-keys/current');
      
      if (!secret?.data?.keys) {
        logger.info('No current keys found in Vault');
        return [];
      }

      return secret.data.keys as JWTKeyPair[];
    } catch (error) {
      logger.error('Failed to get current keys:', error);
      return [];
    }
  }

  /**
   * Generate new RSA key pair
   */
  private generateNewKeyPair(): JWTKeyPair {
    const keyId = `guardagent-${Date.now()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (this.config.retentionDays * 24 * 60 * 60 * 1000));

    const { privateKey, publicKey } = generateKeyPairSync('rsa', {
      modulusLength: this.config.keySize,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    return {
      privateKey,
      publicKey,
      keyId,
      createdAt: now,
      expiresAt,
      status: 'active',
    };
  }

  /**
   * Store new key pair in Vault
   */
  private async storeNewKeyPair(keyPair: JWTKeyPair): Promise<void> {
    try {
      // Store the new key as current
      await this.vaultService.writeSecret('jwt-keys/current', {
        keys: [keyPair],
      });

      // Also store in versioned path for history
      await this.vaultService.writeSecret(`jwt-keys/history/${keyPair.keyId}`, {
        ...keyPair,
      });

      logger.info('New key pair stored in Vault', {
        keyId: keyPair.keyId,
      });
    } catch (error) {
      logger.error('Failed to store new key pair:', error);
      throw error;
    }
  }

  /**
   * Mark current keys as deprecated
   */
  private async deprecateCurrentKeys(currentKeys: JWTKeyPair[]): Promise<void> {
    if (currentKeys.length === 0) {
      return;
    }

    try {
      const deprecatedKeys = currentKeys.map(key => ({
        ...key,
        status: 'deprecated' as const,
      }));

      await this.vaultService.writeSecret('jwt-keys/deprecated', {
        keys: deprecatedKeys,
      });

      logger.info('Current keys marked as deprecated', {
        count: deprecatedKeys.length,
      });
    } catch (error) {
      logger.error('Failed to deprecate current keys:', error);
      throw error;
    }
  }

  /**
   * Clean up old keys beyond retention period
   */
  private async cleanupOldKeys(): Promise<void> {
    try {
      const cutoffDate = new Date(Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000));
      
      const deprecatedSecret = await this.vaultService.readSecret('jwt-keys/deprecated');
      
      if (!deprecatedSecret?.data?.keys) {
        return;
      }

      const deprecatedKeys = deprecatedSecret.data.keys as JWTKeyPair[];
      const keysToKeep = deprecatedKeys.filter(key => 
        new Date(key.createdAt) > cutoffDate
      );
      const keysToDelete = deprecatedKeys.filter(key => 
        new Date(key.createdAt) <= cutoffDate
      );

      if (keysToDelete.length > 0) {
        // Update deprecated keys list
        await this.vaultService.writeSecret('jwt-keys/deprecated', {
          keys: keysToKeep,
        });

        // Move old keys to revoked status
        for (const key of keysToDelete) {
          await this.vaultService.writeSecret(`jwt-keys/revoked/${key.keyId}`, {
            ...key,
            status: 'revoked',
            revokedAt: new Date(),
          });
        }

        logger.info('Old keys cleaned up', {
          deleted: keysToDelete.length,
          kept: keysToKeep.length,
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup old keys:', error);
      // Don't throw - cleanup failure shouldn't fail the rotation
    }
  }

  /**
   * Send rotation success notification
   */
  private async sendRotationNotification(
    newKeyPair: JWTKeyPair,
    deprecatedKeys: JWTKeyPair[],
    duration: number
  ): Promise<void> {
    try {
      const context: AlertContext = {
        type: 'system_error', // Using existing type
        severity: 'low',
        title: 'JWT Key Rotation Completed',
        description: `JWT keys have been successfully rotated. New key ID: ${newKeyPair.keyId}`,
        metadata: {
          newKeyId: newKeyPair.keyId,
          deprecatedKeyCount: deprecatedKeys.length,
          duration: `${duration}ms`,
          keySize: this.config.keySize,
          retentionDays: this.config.retentionDays,
        },
        timestamp: new Date(),
      };

      await this.mailService.sendSystemAlert(context);
    } catch (error) {
      logger.error('Failed to send rotation notification:', error);
      // Don't throw - notification failure shouldn't fail the rotation
    }
  }

  /**
   * Send rotation failure notification
   */
  private async sendFailureNotification(error: any): Promise<void> {
    try {
      const context: AlertContext = {
        type: 'system_error',
        severity: 'high',
        title: 'JWT Key Rotation Failed',
        description: `JWT key rotation failed with error: ${error.message}`,
        metadata: {
          error: error.message,
          stack: error.stack,
          config: this.config,
        },
        runbookUrl: 'https://docs.guardagent.io/runbooks/key-rotation-failure',
        timestamp: new Date(),
      };

      await this.mailService.sendSystemAlert(context);
    } catch (notificationError) {
      logger.error('Failed to send failure notification:', notificationError);
    }
  }

  /**
   * Manual rotation trigger (for testing/emergency)
   */
  async triggerRotation(): Promise<void> {
    logger.info('Manual key rotation triggered');
    await this.performRotation();
  }

  /**
   * Get rotation status
   */
  async getRotationStatus(): Promise<{
    enabled: boolean;
    nextRun: Date | null;
    lastRun: Date | null;
    currentKeys: number;
    deprecatedKeys: number;
  }> {
    const currentKeys = await this.getCurrentKeys();
    
    let deprecatedKeys = 0;
    try {
      const deprecatedSecret = await this.vaultService.readSecret('jwt-keys/deprecated');
      deprecatedKeys = deprecatedSecret?.data?.keys?.length || 0;
    } catch {
      // Ignore error
    }

    return {
      enabled: this.config.enabled,
      nextRun: this.cronJob?.nextDate()?.toDate() || null,
      lastRun: null, // Would need to store this in Vault
      currentKeys: currentKeys.length,
      deprecatedKeys,
    };
  }
}

// CLI execution
if (require.main === module) {
  const rotationService = KeyRotationService.getInstance();
  
  rotationService.initialize()
    .then(() => {
      if (process.argv.includes('--trigger')) {
        return rotationService.triggerRotation();
      } else {
        rotationService.start();
        logger.info('Key rotation service started');
      }
    })
    .catch((error) => {
      logger.error('Failed to start key rotation service:', error);
      process.exit(1);
    });
}

import { Repository, QueryRunner } from 'typeorm';
import { createHash } from 'crypto';
import pino from 'pino';
import { AppDataSource } from '../config/database';
import { HashChainEntity } from '../entities/HashChain';
import { LogJobData } from './QueueService';

const logger = pino({
  name: 'core:hash-chain-service',
  level: process.env.LOG_LEVEL || 'info',
});

export interface HashChainEntry {
  sequenceNumber: number;
  currentHash: string;
  previousHash?: string;
  requestId: string;
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  ip?: string;
  tenantId?: string;
  complianceMetadata: any;
  s3Key?: string;
  logTimestamp: Date;
}

export class HashChainService {
  private hashChainRepository: Repository<HashChainEntity>;

  constructor() {
    this.hashChainRepository = AppDataSource.getRepository(HashChainEntity);
  }

  /**
   * Add entry to hash chain with atomic sequence number generation
   * This method ensures thread-safety across multiple workers
   */
  async addChainEntry(logData: LogJobData, s3Key: string): Promise<HashChainEntry> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get the next sequence number atomically
      const result = await queryRunner.query(`
        SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_sequence
        FROM hash_chain
        FOR UPDATE
      `);
      
      const sequenceNumber = parseInt(result[0].next_sequence);

      // Get the previous hash (if any)
      let previousHash: string | undefined;
      if (sequenceNumber > 1) {
        const previousEntry = await queryRunner.query(`
          SELECT current_hash 
          FROM hash_chain 
          WHERE sequence_number = $1
        `, [sequenceNumber - 1]);
        
        if (previousEntry.length > 0) {
          previousHash = previousEntry[0].current_hash;
        }
      }

      // Create the hash chain entry data
      const chainData = {
        sequenceNumber,
        previousHash,
        requestId: logData.requestId,
        method: logData.method,
        url: logData.url,
        statusCode: logData.statusCode,
        responseTime: logData.responseTime,
        ip: logData.ip,
        tenantId: logData.tenantId,
        complianceMetadata: logData.complianceMetadata,
        s3Key,
        logTimestamp: new Date(logData.timestamp),
      };

      // Calculate current hash
      const currentHash = this.calculateHash(chainData);
      chainData.currentHash = currentHash;

      // Insert the new entry
      const entity = new HashChainEntity();
      Object.assign(entity, chainData);
      
      await queryRunner.manager.save(entity);
      await queryRunner.commitTransaction();

      logger.debug('Hash chain entry added', {
        sequenceNumber,
        currentHash: currentHash.substring(0, 8) + '...',
        previousHash: previousHash?.substring(0, 8) + '...',
        requestId: logData.requestId,
      });

      return chainData as HashChainEntry;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      logger.error('Failed to add hash chain entry:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get the last hash in the chain
   */
  async getLastHash(): Promise<string> {
    try {
      const lastEntry = await this.hashChainRepository.findOne({
        order: { sequenceNumber: 'DESC' },
        select: ['currentHash'],
      });

      return lastEntry?.currentHash || '';
    } catch (error) {
      logger.error('Failed to get last hash:', error);
      return '';
    }
  }

  /**
   * Get the next sequence number
   */
  async getNextSequenceNumber(): Promise<number> {
    try {
      const result = await this.hashChainRepository.query(`
        SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_sequence
        FROM hash_chain
      `);
      
      return parseInt(result[0].next_sequence);
    } catch (error) {
      logger.error('Failed to get next sequence number:', error);
      return 1;
    }
  }

  /**
   * Verify chain integrity
   */
  async verifyChainIntegrity(limit: number = 1000): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      const entries = await this.hashChainRepository.find({
        order: { sequenceNumber: 'ASC' },
        take: limit,
      });

      if (entries.length === 0) {
        return { valid: true, errors: [] };
      }

      // Check first entry
      if (entries[0].sequenceNumber !== 1) {
        errors.push(`First entry should have sequence number 1, got ${entries[0].sequenceNumber}`);
      }

      if (entries[0].previousHash !== null && entries[0].previousHash !== undefined) {
        errors.push('First entry should not have a previous hash');
      }

      // Check subsequent entries
      for (let i = 1; i < entries.length; i++) {
        const current = entries[i];
        const previous = entries[i - 1];

        // Check sequence continuity
        if (current.sequenceNumber !== previous.sequenceNumber + 1) {
          errors.push(`Sequence gap: ${previous.sequenceNumber} -> ${current.sequenceNumber}`);
        }

        // Check hash chain
        if (current.previousHash !== previous.currentHash) {
          errors.push(`Hash chain broken at sequence ${current.sequenceNumber}`);
        }

        // Verify current hash calculation
        const expectedHash = this.calculateHash({
          sequenceNumber: current.sequenceNumber,
          previousHash: current.previousHash,
          requestId: current.requestId,
          method: current.method,
          url: current.url,
          statusCode: current.statusCode,
          responseTime: current.responseTime,
          ip: current.ip,
          tenantId: current.tenantId,
          complianceMetadata: current.complianceMetadata,
          s3Key: current.s3Key,
          logTimestamp: current.logTimestamp,
        });

        if (current.currentHash !== expectedHash) {
          errors.push(`Hash mismatch at sequence ${current.sequenceNumber}`);
        }
      }

      const valid = errors.length === 0;
      
      logger.info('Chain integrity verification completed', {
        entriesChecked: entries.length,
        valid,
        errorsFound: errors.length,
      });

      return { valid, errors };

    } catch (error) {
      logger.error('Chain integrity verification failed:', error);
      return { valid: false, errors: [`Verification failed: ${error.message}`] };
    }
  }

  /**
   * Calculate hash for chain entry
   */
  private calculateHash(data: Omit<HashChainEntry, 'currentHash'>): string {
    const hashInput = JSON.stringify({
      sequenceNumber: data.sequenceNumber,
      previousHash: data.previousHash || '',
      requestId: data.requestId,
      method: data.method,
      url: data.url,
      statusCode: data.statusCode,
      responseTime: data.responseTime,
      ip: data.ip || '',
      tenantId: data.tenantId || '',
      complianceMetadata: data.complianceMetadata,
      s3Key: data.s3Key || '',
      timestamp: data.logTimestamp.toISOString(),
    });

    return createHash('sha256').update(hashInput).digest('hex');
  }

  /**
   * Get chain statistics
   */
  async getChainStats(): Promise<{
    totalEntries: number;
    lastSequenceNumber: number;
    lastHash: string;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    try {
      const stats = await this.hashChainRepository.query(`
        SELECT 
          COUNT(*) as total_entries,
          COALESCE(MAX(sequence_number), 0) as last_sequence_number,
          MIN(created_at) as oldest_entry,
          MAX(created_at) as newest_entry
        FROM hash_chain
      `);

      const lastHash = await this.getLastHash();

      return {
        totalEntries: parseInt(stats[0].total_entries),
        lastSequenceNumber: parseInt(stats[0].last_sequence_number),
        lastHash,
        oldestEntry: stats[0].oldest_entry,
        newestEntry: stats[0].newest_entry,
      };
    } catch (error) {
      logger.error('Failed to get chain stats:', error);
      throw error;
    }
  }
}

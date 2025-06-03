import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { createHash } from 'crypto';

const logger = pino({
  name: 'core:risk-engine',
  level: process.env.LOG_LEVEL || 'info',
});

export type RiskVector = "inj_prompt" | "data_category" | "origin" | "tenant_reputation";

export interface FactorWeight {
  vector: RiskVector;
  weight: number;
  description?: string;
  rationale?: string;
}

export interface RiskThresholds {
  low: number;
  medium: number;
  high: number;
  block: number;
}

export interface RiskWeightsConfig {
  defaultWeights: FactorWeight[];
  tenantOverrides?: Record<string, FactorWeight[]>;
  thresholds: RiskThresholds;
  version: string;
  lastUpdated: string;
  maintainer: string;
}

export interface AnalysisContext {
  requestId: string;
  tenantId?: string;
  injectionConfidence: number;    // 0-1
  dataSensitivityIndex: number;   // 0-1
  originTrustLevel: number;       // 0-1
  tenantRiskProfile?: number;     // 0-1 (mockado para Sprint 3)
  metadata?: Record<string, any>;
}

export interface RiskAssessment {
  score: number;                  // 0-100
  bucket: 'low' | 'medium' | 'high';
  shouldBlock: boolean;
  factors: Record<RiskVector, number>;
  weights: Record<RiskVector, number>;
  timestamp: Date;
  configVersion: string;
}

export class RiskEngine {
  private static instance: RiskEngine;
  private weightsConfig: RiskWeightsConfig;
  private configPath: string;
  private configChecksum: string = '';

  private constructor() {
    this.configPath = process.env.RISK_WEIGHTS_CONFIG_PATH || 
                     path.resolve(__dirname, '../../config/risk-weights.yaml');
    this.loadConfig();
    this.watchConfigFile();
  }

  static getInstance(): RiskEngine {
    if (!RiskEngine.instance) {
      RiskEngine.instance = new RiskEngine();
    }
    return RiskEngine.instance;
  }

  /**
   * Load risk weights configuration from YAML file
   */
  private loadConfig(): void {
    try {
      const configContent = fs.readFileSync(this.configPath, 'utf8');
      const newChecksum = createHash('sha256').update(configContent).digest('hex');
      
      if (newChecksum === this.configChecksum) {
        return; // No changes
      }

      this.weightsConfig = yaml.load(configContent) as RiskWeightsConfig;
      this.configChecksum = newChecksum;
      
      this.validateConfig();
      
      logger.info('Risk weights configuration loaded', {
        version: this.weightsConfig.version,
        weightsCount: this.weightsConfig.defaultWeights.length,
        tenantOverrides: Object.keys(this.weightsConfig.tenantOverrides || {}).length,
        checksum: newChecksum.substring(0, 8),
      });
    } catch (error) {
      logger.error('Failed to load risk weights configuration:', error);
      
      // Fallback to default configuration
      if (!this.weightsConfig) {
        this.weightsConfig = this.getDefaultConfig();
        logger.warn('Using fallback default risk weights configuration');
      }
    }
  }

  /**
   * Watch configuration file for changes
   */
  private watchConfigFile(): void {
    fs.watchFile(this.configPath, { interval: 1000 }, () => {
      logger.info('Risk weights configuration file changed, reloading...');
      this.loadConfig();
    });
  }

  /**
   * Validate configuration structure and weights
   */
  private validateConfig(): void {
    if (!this.weightsConfig.defaultWeights || !Array.isArray(this.weightsConfig.defaultWeights)) {
      throw new Error('Invalid configuration: defaultWeights must be an array');
    }

    const totalWeight = this.weightsConfig.defaultWeights.reduce((sum, w) => sum + w.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      logger.warn(`Risk weights sum to ${totalWeight}, expected 1.0`);
    }

    // Validate required vectors
    const requiredVectors: RiskVector[] = ['inj_prompt', 'data_category', 'origin', 'tenant_reputation'];
    const configVectors = this.weightsConfig.defaultWeights.map(w => w.vector);
    
    for (const vector of requiredVectors) {
      if (!configVectors.includes(vector)) {
        throw new Error(`Missing required risk vector: ${vector}`);
      }
    }
  }

  /**
   * Get default configuration as fallback
   */
  private getDefaultConfig(): RiskWeightsConfig {
    return {
      defaultWeights: [
        { vector: 'inj_prompt', weight: 0.45, description: 'Prompt injection confidence' },
        { vector: 'data_category', weight: 0.35, description: 'Data sensitivity index' },
        { vector: 'origin', weight: 0.10, description: 'Origin trust level' },
        { vector: 'tenant_reputation', weight: 0.10, description: 'Tenant risk profile' },
      ],
      thresholds: { low: 30, medium: 70, high: 90, block: 80 },
      version: '1.0-fallback',
      lastUpdated: new Date().toISOString(),
      maintainer: 'GuardAgent Core (fallback)',
    };
  }

  /**
   * Calculate risk score for a given context
   */
  calculateRisk(ctx: AnalysisContext): RiskAssessment {
    const factors: Record<RiskVector, number> = {
      inj_prompt: Math.max(0, Math.min(1, ctx.injectionConfidence)),
      data_category: Math.max(0, Math.min(1, ctx.dataSensitivityIndex)),
      origin: Math.max(0, Math.min(1, ctx.originTrustLevel)),
      tenant_reputation: Math.max(0, Math.min(1, ctx.tenantRiskProfile || 0.5)), // Mockado para Sprint 3
    };

    // Get weights (with potential tenant overrides for future)
    const weights = this.getWeightsForTenant(ctx.tenantId);
    const weightsMap: Record<RiskVector, number> = {};
    
    let totalScore = 0;
    for (const weightConfig of weights) {
      const factor = factors[weightConfig.vector];
      if (factor !== undefined) {
        totalScore += weightConfig.weight * factor;
        weightsMap[weightConfig.vector] = weightConfig.weight;
      }
    }

    const score = Math.min(100, Math.max(0, Math.round(totalScore * 100)));
    const bucket = this.getScoreBucket(score);
    const shouldBlock = score >= this.weightsConfig.thresholds.block;

    const assessment: RiskAssessment = {
      score,
      bucket,
      shouldBlock,
      factors,
      weights: weightsMap,
      timestamp: new Date(),
      configVersion: this.weightsConfig.version,
    };

    logger.debug('Risk assessment calculated', {
      requestId: ctx.requestId,
      tenantId: ctx.tenantId,
      score,
      bucket,
      shouldBlock,
      factors,
    });

    return assessment;
  }

  /**
   * Get weights for specific tenant (with override support for future)
   */
  private getWeightsForTenant(tenantId?: string): FactorWeight[] {
    // Future enhancement: check tenantOverrides
    if (tenantId && this.weightsConfig.tenantOverrides?.[tenantId]) {
      logger.debug('Using tenant-specific risk weights', { tenantId });
      return this.weightsConfig.tenantOverrides[tenantId];
    }
    
    return this.weightsConfig.defaultWeights;
  }

  /**
   * Determine risk bucket based on score
   */
  private getScoreBucket(score: number): 'low' | 'medium' | 'high' {
    const thresholds = this.weightsConfig.thresholds;
    
    if (score <= thresholds.low) return 'low';
    if (score <= thresholds.medium) return 'medium';
    return 'high';
  }

  /**
   * Get current configuration (for debugging/monitoring)
   */
  getConfig(): RiskWeightsConfig {
    return { ...this.weightsConfig };
  }

  /**
   * Get configuration checksum
   */
  getConfigChecksum(): string {
    return this.configChecksum;
  }

  /**
   * Update tenant risk profile (placeholder for Sprint 4/5)
   */
  async updateTenantRiskProfile(tenantId: string, newProfile: number): Promise<void> {
    // TODO: Implement in Sprint 4/5
    // This would update the tenant's historical risk profile based on:
    // - Average risk scores over last 30 days
    // - Number of blocked requests
    // - Security incidents
    // - Manual adjustments by security team
    
    logger.info('Tenant risk profile update requested (not implemented)', {
      tenantId,
      newProfile,
    });
  }
}

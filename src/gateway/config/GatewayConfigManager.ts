import { PerformanceConfigManager } from '../../utils/performanceConfig';
import { TierManager } from '../../config/tiers';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const logger = pino({
  name: 'gateway:config-manager',
  level: process.env.LOG_LEVEL || 'info',
});

export interface GatewayConfig {
  mode: 'gateway' | 'platform';
  core: {
    // Preserve all Core v0.3.1 configuration
    riskEngine: {
      enabled: boolean;
      configPath: string;
      hotReload: boolean;
    };
    performance: {
      enabled: boolean;
      configPath: string;
    };
    vault: {
      enabled: boolean;
      mode: 'full' | 'minimal' | 'disabled';
    };
    wormLogging: {
      enabled: boolean;
      mode: 'full' | 'basic' | 'disabled';
    };
  };
  gateway: {
    // Gateway-specific simplifications
    ui: {
      selfService: boolean;
      dashboard: 'full' | 'simplified' | 'disabled';
      playground: boolean;
    };
    auth: {
      primaryMethod: 'apikey' | 'jwt' | 'both';
      jwtMode: 'asymmetric' | 'symmetric';
      keyRotation: 'auto' | 'manual' | 'disabled';
    };
    secrets: {
      mode: 'vault' | 'environment' | 'hybrid';
      vaultOptional: boolean;
    };
    compliance: {
      dpia: boolean;
      legalBasis: boolean;
      basicLogging: boolean;
    };
    billing: {
      enabled: boolean;
      provider: 'stripe' | 'mock';
      tiers: string[];
    };
  };
  features: {
    // Feature flags for different tiers
    byTier: Record<string, string[]>;
  };
}

export class GatewayConfigManager {
  private static instance: GatewayConfigManager;
  private config: GatewayConfig;
  private corePerformanceManager: PerformanceConfigManager;
  private tierManager: TierManager;

  private constructor() {
    this.corePerformanceManager = PerformanceConfigManager.getInstance();
    this.tierManager = TierManager.getInstance();
    this.loadConfiguration();
  }

  static getInstance(): GatewayConfigManager {
    if (!GatewayConfigManager.instance) {
      GatewayConfigManager.instance = new GatewayConfigManager();
    }
    return GatewayConfigManager.instance;
  }

  /**
   * Load Gateway configuration while preserving Core settings
   */
  private loadConfiguration(): void {
    try {
      // Load Gateway-specific config
      const gatewayConfigPath = process.env.GATEWAY_CONFIG_PATH || 
                               path.resolve(__dirname, '../../../config/gateway.yaml');
      
      let gatewayConfig: Partial<GatewayConfig> = {};
      
      if (fs.existsSync(gatewayConfigPath)) {
        const configContent = fs.readFileSync(gatewayConfigPath, 'utf8');
        gatewayConfig = yaml.load(configContent) as Partial<GatewayConfig>;
      }

      // Merge with defaults and environment overrides
      this.config = this.mergeWithDefaults(gatewayConfig);
      
      // Apply environment-specific overrides
      this.applyEnvironmentOverrides();
      
      logger.info('Gateway configuration loaded', {
        mode: this.config.mode,
        coreFeatures: Object.keys(this.config.core).filter(key => 
          this.config.core[key as keyof typeof this.config.core]?.enabled
        ),
        gatewayFeatures: Object.keys(this.config.gateway).filter(key => 
          this.config.gateway[key as keyof typeof this.config.gateway]?.enabled !== false
        ),
      });
    } catch (error) {
      logger.error('Failed to load Gateway configuration:', error);
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * Get default Gateway configuration
   */
  private getDefaultConfig(): GatewayConfig {
    return {
      mode: 'gateway',
      core: {
        riskEngine: {
          enabled: true,
          configPath: './config/risk-weights.yaml',
          hotReload: true,
        },
        performance: {
          enabled: true,
          configPath: './config/performance.yaml',
        },
        vault: {
          enabled: process.env.VAULT_ENABLED === 'true',
          mode: process.env.VAULT_MODE as 'full' | 'minimal' | 'disabled' || 'minimal',
        },
        wormLogging: {
          enabled: process.env.WORM_LOGGING_ENABLED === 'true',
          mode: process.env.WORM_MODE as 'full' | 'basic' | 'disabled' || 'basic',
        },
      },
      gateway: {
        ui: {
          selfService: true,
          dashboard: 'simplified',
          playground: true,
        },
        auth: {
          primaryMethod: 'apikey',
          jwtMode: 'symmetric',
          keyRotation: 'manual',
        },
        secrets: {
          mode: 'environment',
          vaultOptional: true,
        },
        compliance: {
          dpia: false,
          legalBasis: false,
          basicLogging: true,
        },
        billing: {
          enabled: process.env.BILLING_ENABLED === 'true',
          provider: process.env.BILLING_PROVIDER as 'stripe' | 'mock' || 'mock',
          tiers: ['free', 'starter', 'pro'],
        },
      },
      features: {
        byTier: {
          free: ['promptInjection', 'piiDetection', 'basicLogging'],
          starter: ['promptInjection', 'piiDetection', 'piiMasking', 'customPolicies', 'basicLogging'],
          pro: ['promptInjection', 'piiDetection', 'piiMasking', 'riskScoring', 'webhooks', 'advancedMetrics', 'basicLogging'],
        },
      },
    };
  }

  /**
   * Merge configuration with defaults
   */
  private mergeWithDefaults(config: Partial<GatewayConfig>): GatewayConfig {
    const defaults = this.getDefaultConfig();
    
    return {
      mode: config.mode || defaults.mode,
      core: {
        ...defaults.core,
        ...config.core,
      },
      gateway: {
        ...defaults.gateway,
        ...config.gateway,
      },
      features: {
        ...defaults.features,
        ...config.features,
      },
    };
  }

  /**
   * Apply environment-specific overrides
   */
  private applyEnvironmentOverrides(): void {
    const env = process.env.NODE_ENV || 'development';
    
    // Development overrides
    if (env === 'development') {
      this.config.gateway.billing.enabled = false;
      this.config.gateway.billing.provider = 'mock';
      this.config.core.vault.mode = 'disabled';
      this.config.core.wormLogging.mode = 'basic';
    }
    
    // Production overrides
    if (env === 'production') {
      this.config.gateway.billing.enabled = true;
      this.config.core.vault.mode = this.config.core.vault.enabled ? 'full' : 'disabled';
      this.config.core.wormLogging.mode = this.config.core.wormLogging.enabled ? 'full' : 'basic';
    }
    
    // Gateway mode specific overrides
    if (process.env.GATEWAY_MODE === 'true') {
      this.config.mode = 'gateway';
      this.config.gateway.ui.selfService = true;
      this.config.gateway.ui.dashboard = 'simplified';
    }
  }

  /**
   * Get complete configuration
   */
  getConfig(): GatewayConfig {
    return this.config;
  }

  /**
   * Check if Core feature is enabled
   */
  isCoreFeatureEnabled(feature: keyof GatewayConfig['core']): boolean {
    return this.config.core[feature]?.enabled || false;
  }

  /**
   * Check if Gateway feature is enabled
   */
  isGatewayFeatureEnabled(feature: string): boolean {
    const gatewayConfig = this.config.gateway as any;
    return gatewayConfig[feature]?.enabled !== false;
  }

  /**
   * Check if feature is enabled for specific tier
   */
  isFeatureEnabledForTier(feature: string, tier: string): boolean {
    const tierFeatures = this.config.features.byTier[tier] || [];
    return tierFeatures.includes(feature);
  }

  /**
   * Get Core performance configuration
   */
  getCorePerformanceConfig() {
    return this.corePerformanceManager.getConfig();
  }

  /**
   * Get tier configuration
   */
  getTierConfig(tier: string) {
    return this.tierManager.getTierConfig(tier);
  }

  /**
   * Get secrets configuration for current mode
   */
  getSecretsConfig() {
    const mode = this.config.gateway.secrets.mode;
    
    switch (mode) {
      case 'vault':
        return {
          useVault: true,
          fallbackToEnv: this.config.gateway.secrets.vaultOptional,
        };
      
      case 'environment':
        return {
          useVault: false,
          fallbackToEnv: true,
        };
      
      case 'hybrid':
        return {
          useVault: this.config.core.vault.enabled,
          fallbackToEnv: true,
        };
      
      default:
        return {
          useVault: false,
          fallbackToEnv: true,
        };
    }
  }

  /**
   * Get authentication configuration
   */
  getAuthConfig() {
    return {
      primaryMethod: this.config.gateway.auth.primaryMethod,
      jwtEnabled: ['jwt', 'both'].includes(this.config.gateway.auth.primaryMethod),
      jwtMode: this.config.gateway.auth.jwtMode,
      keyRotation: this.config.gateway.auth.keyRotation,
    };
  }

  /**
   * Get logging configuration based on mode
   */
  getLoggingConfig() {
    const wormMode = this.config.core.wormLogging.mode;
    
    return {
      enabled: this.config.gateway.compliance.basicLogging,
      wormEnabled: this.config.core.wormLogging.enabled,
      wormMode,
      s3Config: {
        objectLock: wormMode === 'full',
        retentionMode: wormMode === 'full' ? 'COMPLIANCE' : 'GOVERNANCE',
      },
    };
  }

  /**
   * Get UI configuration
   */
  getUIConfig() {
    return {
      selfService: this.config.gateway.ui.selfService,
      dashboard: this.config.gateway.ui.dashboard,
      playground: this.config.gateway.ui.playground,
      showAdvancedFeatures: this.config.mode === 'platform',
    };
  }

  /**
   * Get billing configuration
   */
  getBillingConfig() {
    return {
      enabled: this.config.gateway.billing.enabled,
      provider: this.config.gateway.billing.provider,
      tiers: this.config.gateway.billing.tiers,
      mockMode: this.config.gateway.billing.provider === 'mock',
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<GatewayConfig>): void {
    this.config = this.mergeWithDefaults({
      ...this.config,
      ...updates,
    });
    
    logger.info('Gateway configuration updated', {
      updates: Object.keys(updates),
    });
  }

  /**
   * Reload configuration from file
   */
  reloadConfig(): void {
    logger.info('Reloading Gateway configuration...');
    this.loadConfiguration();
  }

  /**
   * Get configuration summary for debugging
   */
  getConfigSummary() {
    return {
      mode: this.config.mode,
      coreFeatures: {
        riskEngine: this.config.core.riskEngine.enabled,
        vault: this.config.core.vault.enabled,
        wormLogging: this.config.core.wormLogging.enabled,
        performance: this.config.core.performance.enabled,
      },
      gatewayFeatures: {
        selfService: this.config.gateway.ui.selfService,
        dashboard: this.config.gateway.ui.dashboard,
        billing: this.config.gateway.billing.enabled,
        primaryAuth: this.config.gateway.auth.primaryMethod,
      },
      tiers: this.config.gateway.billing.tiers,
      environment: process.env.NODE_ENV,
    };
  }
}

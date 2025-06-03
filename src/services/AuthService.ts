import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ulid } from 'ulid';
import pino from 'pino';
import { AppDataSource } from '../config/database';
import { TenantEntity } from '../entities/Tenant';
import { ApiKeyEntity, ApiKeyScope } from '../entities/ApiKey';
import { JWTService, JWTPayload } from './JWTService';

const logger = pino({
  name: 'core:auth-service',
  level: process.env.LOG_LEVEL || 'info',
});

export interface CreateApiKeyRequest {
  tenantId: string;
  name: string;
  scopes: ApiKeyScope[];
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface CreateApiKeyResponse {
  id: string;
  name: string;
  key: string; // Only returned once during creation
  keyPrefix: string;
  scopes: ApiKeyScope[];
  expiresAt?: Date;
  createdAt: Date;
}

export interface AuthenticatedContext {
  tenantId: string;
  tenant: TenantEntity;
  apiKey: ApiKeyEntity;
  scopes: ApiKeyScope[];
  jwtPayload: JWTPayload;
}

export class AuthService {
  private tenantRepository: Repository<TenantEntity>;
  private apiKeyRepository: Repository<ApiKeyEntity>;
  private jwtService: JWTService;

  constructor() {
    this.tenantRepository = AppDataSource.getRepository(TenantEntity);
    this.apiKeyRepository = AppDataSource.getRepository(ApiKeyEntity);
    this.jwtService = new JWTService();
  }

  /**
   * Initialize the auth service
   */
  async initialize(): Promise<void> {
    await this.jwtService.initialize();
  }

  /**
   * Create a new API key for a tenant
   */
  async createApiKey(request: CreateApiKeyRequest): Promise<CreateApiKeyResponse> {
    // Verify tenant exists
    const tenant = await this.tenantRepository.findOne({
      where: { id: request.tenantId, active: true }
    });

    if (!tenant) {
      throw new Error('Tenant not found or inactive');
    }

    // Generate API key
    const keyId = ulid();
    const keySecret = randomBytes(32).toString('hex');
    const fullKey = `ga_${process.env.NODE_ENV === 'production' ? 'live' : 'test'}_${keySecret}`;
    const keyHash = createHash('sha256').update(fullKey).digest('hex');
    const keyPrefix = fullKey.substring(0, 16);

    // Create API key entity
    const apiKey = new ApiKeyEntity();
    apiKey.id = keyId;
    apiKey.name = request.name;
    apiKey.keyHash = keyHash;
    apiKey.keyPrefix = keyPrefix;
    apiKey.tenantId = request.tenantId;
    apiKey.scopes = request.scopes;
    apiKey.expiresAt = request.expiresAt;
    apiKey.metadata = request.metadata;

    const savedApiKey = await this.apiKeyRepository.save(apiKey);

    logger.info(`API key created for tenant ${request.tenantId}`, {
      keyId: savedApiKey.id,
      keyPrefix: savedApiKey.keyPrefix,
      scopes: savedApiKey.scopes,
    });

    return {
      id: savedApiKey.id,
      name: savedApiKey.name,
      key: fullKey, // Only returned during creation
      keyPrefix: savedApiKey.keyPrefix,
      scopes: savedApiKey.scopes,
      expiresAt: savedApiKey.expiresAt,
      createdAt: savedApiKey.createdAt,
    };
  }

  /**
   * Authenticate API key and generate JWT
   */
  async authenticateApiKey(apiKey: string): Promise<string> {
    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    const apiKeyEntity = await this.apiKeyRepository.findOne({
      where: { keyHash, active: true },
      relations: ['tenant'],
    });

    if (!apiKeyEntity) {
      throw new Error('Invalid API key');
    }

    if (!apiKeyEntity.tenant.active) {
      throw new Error('Tenant is inactive');
    }

    if (apiKeyEntity.expiresAt && apiKeyEntity.expiresAt < new Date()) {
      throw new Error('API key has expired');
    }

    // Update usage statistics
    apiKeyEntity.lastUsedAt = new Date();
    apiKeyEntity.usageCount += 1;
    await this.apiKeyRepository.save(apiKeyEntity);

    // Generate JWT
    const jwtPayload: Omit<JWTPayload, 'iss' | 'aud' | 'iat' | 'exp'> = {
      sub: apiKeyEntity.tenantId,
      jti: apiKeyEntity.id,
      scope: apiKeyEntity.scopes,
      tenant: {
        id: apiKeyEntity.tenant.id,
        name: apiKeyEntity.tenant.name,
        plan: apiKeyEntity.tenant.plan,
      },
      keyId: apiKeyEntity.id,
    };

    return this.jwtService.generateToken(jwtPayload);
  }

  /**
   * Verify JWT and return authenticated context
   */
  async verifyToken(token: string): Promise<AuthenticatedContext> {
    const jwtPayload = this.jwtService.verifyToken(token);

    // Verify API key is still active
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id: jwtPayload.keyId, active: true },
      relations: ['tenant'],
    });

    if (!apiKey) {
      throw new Error('API key not found or inactive');
    }

    if (!apiKey.tenant.active) {
      throw new Error('Tenant is inactive');
    }

    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      throw new Error('API key has expired');
    }

    return {
      tenantId: apiKey.tenantId,
      tenant: apiKey.tenant,
      apiKey,
      scopes: apiKey.scopes,
      jwtPayload,
    };
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(keyId: string, tenantId: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: { id: keyId, tenantId },
    });

    if (!apiKey) {
      throw new Error('API key not found');
    }

    apiKey.active = false;
    await this.apiKeyRepository.save(apiKey);

    logger.info(`API key revoked`, {
      keyId,
      tenantId,
      keyPrefix: apiKey.keyPrefix,
    });
  }

  /**
   * List API keys for a tenant
   */
  async listApiKeys(tenantId: string): Promise<Omit<ApiKeyEntity, 'keyHash'>[]> {
    const apiKeys = await this.apiKeyRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });

    return apiKeys.map(key => {
      const { keyHash, ...safeKey } = key;
      return safeKey;
    });
  }

  /**
   * Check if scope is allowed for the authenticated context
   */
  hasScope(context: AuthenticatedContext, requiredScope: ApiKeyScope): boolean {
    return context.scopes.includes(requiredScope) || context.scopes.includes(ApiKeyScope.ADMIN);
  }

  /**
   * Get JWKS for public key distribution
   */
  getJWKS() {
    return this.jwtService.getJWKS();
  }
}

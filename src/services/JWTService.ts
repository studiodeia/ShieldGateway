import jwt from 'jsonwebtoken';
import { JWK, JWS } from 'node-jose';
import pino from 'pino';
import { ApiKeyScope } from '../entities/ApiKey';
import { SecretManager } from './SecretManager';

const logger = pino({
  name: 'core:jwt-service',
  level: process.env.LOG_LEVEL || 'info',
});

export interface JWTPayload {
  sub: string; // tenant ID
  iss: string; // issuer
  aud: string; // audience
  exp: number; // expiration time
  iat: number; // issued at
  jti: string; // JWT ID (API key ID)
  scope: ApiKeyScope[];
  tenant: {
    id: string;
    name: string;
    plan: string;
  };
  keyId: string; // API key ID for revocation
}

export interface JWKSResponse {
  keys: Array<{
    kty: string;
    use: string;
    kid: string;
    n: string;
    e: string;
    alg: string;
  }>;
}

export class JWTService {
  private privateKey: string = '';
  private publicKey: string = '';
  private keyId: string = '';
  private issuer: string;
  private audience: string;
  private jwkSet: any;
  private secretManager: SecretManager;
  private initialized: boolean = false;

  constructor() {
    this.issuer = process.env.JWT_ISSUER || 'https://api.guardagent.io';
    this.audience = process.env.JWT_AUDIENCE || 'guardagent-api';
    this.secretManager = SecretManager.getInstance();
  }

  /**
   * Initialize JWT service with secure key loading
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const keyPair = await this.secretManager.getJWTKeyPair();
      this.privateKey = keyPair.privateKey;
      this.publicKey = keyPair.publicKey;
      this.keyId = keyPair.keyId;

      await this.initializeJWKS();
      this.initialized = true;

      logger.info('JWT service initialized successfully', {
        keyId: this.keyId,
        issuer: this.issuer,
      });
    } catch (error) {
      logger.error('Failed to initialize JWT service:', error);
      throw error;
    }
  }



  private async initializeJWKS(): Promise<void> {
    try {
      const key = await JWK.asKey(this.publicKey, 'pem');
      this.jwkSet = {
        keys: [{
          kty: key.kty,
          use: 'sig',
          kid: this.keyId,
          n: key.n,
          e: key.e,
          alg: 'RS256'
        }]
      };
    } catch (error) {
      logger.error('Failed to initialize JWKS:', error);
      throw error;
    }
  }

  /**
   * Generate JWT token for API key
   */
  generateToken(payload: Omit<JWTPayload, 'iss' | 'aud' | 'iat' | 'exp'>): string {
    if (!this.initialized) {
      throw new Error('JWT service not initialized. Call initialize() first.');
    }

    const now = Math.floor(Date.now() / 1000);
    const ttl = parseInt(process.env.JWT_TTL || '3600'); // 1 hour default

    const fullPayload: JWTPayload = {
      ...payload,
      iss: this.issuer,
      aud: this.audience,
      iat: now,
      exp: now + ttl,
    };

    return jwt.sign(fullPayload, this.privateKey, {
      algorithm: 'RS256',
      keyid: this.keyId,
    });
  }

  /**
   * Verify JWT token
   */
  verifyToken(token: string): JWTPayload {
    if (!this.initialized) {
      throw new Error('JWT service not initialized. Call initialize() first.');
    }

    try {
      const decoded = jwt.verify(token, this.publicKey, {
        algorithms: ['RS256'],
        issuer: this.issuer,
        audience: this.audience,
      }) as JWTPayload;

      return decoded;
    } catch (error) {
      logger.debug('JWT verification failed:', error);
      throw new Error('Invalid token');
    }
  }

  /**
   * Get JWKS for public key distribution
   */
  getJWKS(): JWKSResponse {
    if (!this.initialized) {
      throw new Error('JWT service not initialized. Call initialize() first.');
    }
    return this.jwkSet;
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as JWTPayload;
      if (!decoded || !decoded.exp) return true;
      
      return decoded.exp < Math.floor(Date.now() / 1000);
    } catch {
      return true;
    }
  }
}

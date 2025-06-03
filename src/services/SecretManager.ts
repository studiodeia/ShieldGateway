import pino from 'pino';
import { readFileSync } from 'fs';
import { join } from 'path';

const logger = pino({
  name: 'core:secret-manager',
  level: process.env.LOG_LEVEL || 'info',
});

export interface JWTKeyPair {
  privateKey: string;
  publicKey: string;
  keyId: string;
}

export class SecretManager {
  private static instance: SecretManager;
  private keyPair: JWTKeyPair | null = null;

  private constructor() {}

  static getInstance(): SecretManager {
    if (!SecretManager.instance) {
      SecretManager.instance = new SecretManager();
    }
    return SecretManager.instance;
  }

  /**
   * Get JWT key pair from secure source
   */
  async getJWTKeyPair(): Promise<JWTKeyPair> {
    if (this.keyPair) {
      return this.keyPair;
    }

    try {
      // Try different sources in order of preference
      this.keyPair = await this.loadFromEnvironment() ||
                     await this.loadFromAWSSecretsManager() ||
                     await this.loadFromVault() ||
                     await this.loadFromFileSystem() ||
                     this.generateDefaultKeys();

      logger.info('JWT key pair loaded successfully', {
        keyId: this.keyPair.keyId,
        source: this.getKeySource(),
      });

      return this.keyPair;
    } catch (error) {
      logger.error('Failed to load JWT key pair:', error);
      throw new Error('Unable to load JWT keys');
    }
  }

  /**
   * Load keys from environment variables (production recommended)
   */
  private async loadFromEnvironment(): Promise<JWTKeyPair | null> {
    const privateKey = process.env.JWT_PRIVATE_KEY;
    const publicKey = process.env.JWT_PUBLIC_KEY;
    const keyId = process.env.JWT_KEY_ID;

    if (privateKey && publicKey && keyId) {
      logger.info('Loading JWT keys from environment variables');
      return {
        privateKey: this.formatKey(privateKey, 'PRIVATE'),
        publicKey: this.formatKey(publicKey, 'PUBLIC'),
        keyId,
      };
    }

    return null;
  }

  /**
   * Load keys from AWS Secrets Manager (production recommended)
   */
  private async loadFromAWSSecretsManager(): Promise<JWTKeyPair | null> {
    if (!process.env.AWS_SECRET_NAME) {
      return null;
    }

    try {
      const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
      
      const client = new SecretsManagerClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });

      const command = new GetSecretValueCommand({
        SecretId: process.env.AWS_SECRET_NAME,
      });

      const response = await client.send(command);
      const secret = JSON.parse(response.SecretString);

      if (secret.privateKey && secret.publicKey && secret.keyId) {
        logger.info('Loading JWT keys from AWS Secrets Manager');
        return {
          privateKey: this.formatKey(secret.privateKey, 'PRIVATE'),
          publicKey: this.formatKey(secret.publicKey, 'PUBLIC'),
          keyId: secret.keyId,
        };
      }
    } catch (error) {
      logger.warn('Failed to load from AWS Secrets Manager:', error);
    }

    return null;
  }

  /**
   * Load keys from HashiCorp Vault
   */
  private async loadFromVault(): Promise<JWTKeyPair | null> {
    if (!process.env.VAULT_ADDR || !process.env.VAULT_TOKEN) {
      return null;
    }

    try {
      // Implementation would depend on vault client library
      logger.debug('Vault integration not implemented yet');
    } catch (error) {
      logger.warn('Failed to load from Vault:', error);
    }

    return null;
  }

  /**
   * Load keys from filesystem (development only)
   */
  private async loadFromFileSystem(): Promise<JWTKeyPair | null> {
    if (process.env.NODE_ENV === 'production') {
      return null;
    }

    try {
      const keysPath = process.env.JWT_KEYS_PATH || join(process.cwd(), 'keys');
      const privateKeyPath = join(keysPath, 'private.pem');
      const publicKeyPath = join(keysPath, 'public.pem');

      const privateKey = readFileSync(privateKeyPath, 'utf8');
      const publicKey = readFileSync(publicKeyPath, 'utf8');
      const keyId = process.env.JWT_KEY_ID || 'dev-key-1';

      logger.info('Loading JWT keys from filesystem (development only)');
      return {
        privateKey,
        publicKey,
        keyId,
      };
    } catch (error) {
      logger.debug('Failed to load from filesystem:', error);
    }

    return null;
  }

  /**
   * Generate default keys (development/testing only)
   */
  private generateDefaultKeys(): JWTKeyPair {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot use default keys in production');
    }

    logger.warn('Using default JWT keys - NOT SECURE FOR PRODUCTION');

    return {
      privateKey: `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA4f5wg5l2hKsTeNem/V41fGnJm6gOdrj8ym3rFkEjWT2btphM
OlEn/vTBHp4+qElQUEEflCmH5Xy2kpqvBjSRPwKxRKiMrLJ/WFgILl6cK4DhqOQG
y/Fmg7l2Aa+v+cIpPseVGKH0ws73RBnfqk+V+xBUFcyxHstfn5NjjQoaq30cINhw
vHXyd2OMeHwHDnp2VXpAOBWzOvl3AT3F+fIj5BVdw7vYdq1/JYzpsVVfy+7+kx2W
Ays2Ll6QkQFhc9Qjb60ZXDZw9k/Pka6p8VIcmJvvoIDgd4SPA6ucLAZIDdwQFgqk
Th/hFnajzQqCb5dqLp/1Yfx86EUrXVRXSdWslwIDAQABAoIBAEVxreia2W2Af+bh
OzwhDK2CFuFsz4TsfGFcXibRcCUbAMBjzOCKrAeJkMQqfUahg+cSS2+aClhcLRlt
bSTdEb7a6YitE9M49d7mFsli7DiO7J2oPM76gdNHymx0dg2QKZ5H2h/8AKHFJYKk
3T4s+YoQfU7P7EipfcAjUw1ijGkNJ8xzkvp5z+PCvQGCSpuN/6RM4jrcjMuGVx4l
aGGioBGx+i3llg7SWgnSiTEb5Q3F6dyUehTXgYpUZaN99ZhVeQqHnlBFMAz5Qy3V
Ln9AoQQdMiO3xvE09VTyWyKP4iKXTSsrJ8TyMEdkPZ1AN6+ehCOTzdrX2JkEgC58
dQkZSNECgYEA+ZB52HSBp0q+W24NJfIgGrBqMQZaW11VGYsHDQJRwqZrULcABsSI
8Z8h0AXkltNXhYetBH8RbY04pSh/2+F2rkMcL6ehkj0TyWODjPXUsGlcmZHpXABK
/r7IpgUhbvMXKMfzuJMOtOp/bnToQPiLtfFKCOWoNdUHlm+jZsEAaH0CgYEA6Pq+
a+onnPQfwjlI2A2D8uDzCYXX8RrVGxRJnhSRtNrjbsZDQJRwqZrULcABsSI8Z8h0
AXkltNXhYetBH8RbY04pSh/2+F2rkMcL6ehkj0TyWODjPXUsGlcmZHpXABK/r7Ip
gUhbvMXKMfzuJMOtOp/bnToQPiLtfFKCOWoNdUHlm+jZsEAaH0CgYEA+ZB52HSB
p0q+W24NJfIgGrBqMQZaW11VGYsHDQJRwqZrULcABsSI8Z8h0AXkltNXhYetBH8R
bY04pSh/2+F2rkMcL6ehkj0TyWODjPXUsGlcmZHpXABK/r7IpgUhbvMXKMfzuJMO
tOp/bnToQPiLtfFKCOWoNdUHlm+jZsEAaH0CgYEA6Pq+a+onnPQfwjlI2A2D8uDz
CYXX8RrVGxRJnhSRtNrjbsZDQJRwqZrULcABsSI8Z8h0AXkltNXhYetBH8RbY04p
Sh/2+F2rkMcL6ehkj0TyWODjPXUsGlcmZHpXABK/r7IpgUhbvMXKMfzuJMOtOp/b
nToQPiLtfFKCOWoNdUHlm+jZsEAaH0CgYEA+ZB52HSBp0q+W24NJfIgGrBqMQZa
W11VGYsHDQJRwqZrULcABsSI8Z8h0AXkltNXhYetBH8RbY04pSh/2+F2rkMcL6eh
kj0TyWODjPXUsGlcmZHpXABK/r7IpgUhbvMXKMfzuJMOtOp/bnToQPiLtfFKCOWo
NdUHlm+jZsEAaH0=
-----END RSA PRIVATE KEY-----`,
      publicKey: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA4f5wg5l2hKsTeNem/V41
fGnJm6gOdrj8ym3rFkEjWT2btphMOlEn/vTBHp4+qElQUEEflCmH5Xy2kpqvBjSR
PwKxRKiMrLJ/WFgILl6cK4DhqOQGy/Fmg7l2Aa+v+cIpPseVGKH0ws73RBnfqk+V
+xBUFcyxHstfn5NjjQoaq30cINhwvHXyd2OMeHwHDnp2VXpAOBWzOvl3AT3F+fIj
5BVdw7vYdq1/JYzpsVVfy+7+kx2WAys2Ll6QkQFhc9Qjb60ZXDZw9k/Pka6p8VIc
mJvvoIDgd4SPA6ucLAZIDdwQFgqkTh/hFnajzQqCb5dqLp/1Yfx86EUrXVRXSdWs
lwIDAQAB
-----END PUBLIC KEY-----`,
      keyId: 'default-dev-key',
    };
  }

  /**
   * Format key with proper headers if missing
   */
  private formatKey(key: string, type: 'PRIVATE' | 'PUBLIC'): string {
    const cleanKey = key.replace(/\\n/g, '\n').trim();
    
    const header = type === 'PRIVATE' ? '-----BEGIN RSA PRIVATE KEY-----' : '-----BEGIN PUBLIC KEY-----';
    const footer = type === 'PRIVATE' ? '-----END RSA PRIVATE KEY-----' : '-----END PUBLIC KEY-----';

    if (!cleanKey.includes(header)) {
      return `${header}\n${cleanKey}\n${footer}`;
    }

    return cleanKey;
  }

  /**
   * Get the source of the current keys for logging
   */
  private getKeySource(): string {
    if (process.env.JWT_PRIVATE_KEY) return 'environment';
    if (process.env.AWS_SECRET_NAME) return 'aws-secrets-manager';
    if (process.env.VAULT_ADDR) return 'vault';
    if (process.env.NODE_ENV !== 'production') return 'filesystem';
    return 'default';
  }

  /**
   * Rotate keys (for future implementation)
   */
  async rotateKeys(): Promise<void> {
    // TODO: Implement key rotation
    logger.info('Key rotation not implemented yet');
  }
}

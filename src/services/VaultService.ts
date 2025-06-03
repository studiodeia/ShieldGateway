import axios, { AxiosInstance } from 'axios';
import fs from 'fs';
import pino from 'pino';
import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

const logger = pino({
  name: 'core:vault-service',
  level: process.env.LOG_LEVEL || 'info',
});

export interface VaultConfig {
  address: string;
  authMethod: 'kubernetes' | 'token' | 'aws';
  role?: string;
  authPath?: string;
  namespace?: string;
  timeout?: number;
}

export interface SecretData {
  [key: string]: any;
}

export interface VaultSecret {
  data: SecretData;
  metadata: {
    version: number;
    created_time: string;
    deletion_time?: string;
    destroyed: boolean;
  };
}

export class VaultService {
  private static instance: VaultService;
  private client: AxiosInstance;
  private config: VaultConfig;
  private token: string | null = null;
  private tokenExpiry: Date | null = null;
  private kmsClient: KMSClient;
  private kmsKeyId: string;

  private constructor() {
    this.config = {
      address: process.env.VAULT_ADDR || 'http://localhost:8200',
      authMethod: (process.env.VAULT_AUTH_METHOD as any) || 'kubernetes',
      role: process.env.VAULT_K8S_ROLE || 'guardagent-app',
      authPath: process.env.VAULT_AUTH_PATH || 'kubernetes',
      namespace: process.env.VAULT_NAMESPACE,
      timeout: parseInt(process.env.VAULT_TIMEOUT || '30000'),
    };

    this.client = axios.create({
      baseURL: this.config.address,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Initialize KMS client for additional encryption
    this.kmsClient = new KMSClient({
      region: process.env.AWS_REGION || 'us-east-1',
    });
    
    this.kmsKeyId = process.env.KMS_KEY_ID_FOR_APP_DATA || '';
    
    if (!this.kmsKeyId) {
      logger.warn('KMS_KEY_ID_FOR_APP_DATA not set, KMS encryption disabled');
    }

    // Add request interceptor for authentication
    this.client.interceptors.request.use(async (config) => {
      await this.ensureAuthenticated();
      if (this.token) {
        config.headers['X-Vault-Token'] = this.token;
      }
      if (this.config.namespace) {
        config.headers['X-Vault-Namespace'] = this.config.namespace;
      }
      return config;
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 403) {
          logger.warn('Vault authentication expired, re-authenticating...');
          this.token = null;
          this.tokenExpiry = null;
          
          // Retry the request once after re-authentication
          await this.ensureAuthenticated();
          if (this.token) {
            error.config.headers['X-Vault-Token'] = this.token;
            return this.client.request(error.config);
          }
        }
        throw error;
      }
    );
  }

  static getInstance(): VaultService {
    if (!VaultService.instance) {
      VaultService.instance = new VaultService();
    }
    return VaultService.instance;
  }

  /**
   * Ensure we have a valid authentication token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return; // Token is still valid
    }

    try {
      await this.authenticate();
    } catch (error) {
      logger.error('Vault authentication failed:', error);
      throw new Error('Failed to authenticate with Vault');
    }
  }

  /**
   * Authenticate with Vault using configured method
   */
  private async authenticate(): Promise<void> {
    switch (this.config.authMethod) {
      case 'kubernetes':
        await this.authenticateKubernetes();
        break;
      case 'token':
        await this.authenticateToken();
        break;
      case 'aws':
        await this.authenticateAWS();
        break;
      default:
        throw new Error(`Unsupported auth method: ${this.config.authMethod}`);
    }
  }

  /**
   * Authenticate using Kubernetes service account
   */
  private async authenticateKubernetes(): Promise<void> {
    try {
      const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
      const jwt = fs.readFileSync(tokenPath, 'utf8');

      const response = await axios.post(
        `${this.config.address}/v1/auth/${this.config.authPath}/login`,
        {
          role: this.config.role,
          jwt: jwt,
        },
        { timeout: this.config.timeout }
      );

      this.token = response.data.auth.client_token;
      const leaseDuration = response.data.auth.lease_duration;
      this.tokenExpiry = new Date(Date.now() + (leaseDuration * 1000 * 0.9)); // Renew at 90% of lease

      logger.info('Vault Kubernetes authentication successful', {
        role: this.config.role,
        leaseDuration,
      });
    } catch (error) {
      logger.error('Kubernetes authentication failed:', error);
      throw error;
    }
  }

  /**
   * Authenticate using static token (development only)
   */
  private async authenticateToken(): Promise<void> {
    const token = process.env.VAULT_TOKEN;
    if (!token) {
      throw new Error('VAULT_TOKEN environment variable not set');
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('Token authentication not allowed in production');
    }

    // Verify token is valid
    try {
      await axios.get(`${this.config.address}/v1/auth/token/lookup-self`, {
        headers: { 'X-Vault-Token': token },
        timeout: this.config.timeout,
      });

      this.token = token;
      this.tokenExpiry = new Date(Date.now() + 3600000); // 1 hour

      logger.warn('Using static token authentication (development only)');
    } catch (error) {
      logger.error('Token authentication failed:', error);
      throw error;
    }
  }

  /**
   * Authenticate using AWS IAM
   */
  private async authenticateAWS(): Promise<void> {
    // TODO: Implement AWS IAM authentication
    throw new Error('AWS authentication not implemented yet');
  }

  /**
   * Read secret from Vault
   */
  async readSecret(path: string): Promise<VaultSecret | null> {
    try {
      const response = await this.client.get(`/v1/secret/data/${path}`);
      
      logger.debug('Secret read successfully', {
        path,
        version: response.data.data.metadata.version,
      });

      return response.data.data;
    } catch (error) {
      if (error.response?.status === 404) {
        logger.debug('Secret not found', { path });
        return null;
      }
      
      logger.error('Failed to read secret:', error);
      throw error;
    }
  }

  /**
   * Write secret to Vault
   */
  async writeSecret(path: string, data: SecretData): Promise<void> {
    try {
      await this.client.post(`/v1/secret/data/${path}`, {
        data: data,
      });

      logger.info('Secret written successfully', { path });
    } catch (error) {
      logger.error('Failed to write secret:', error);
      throw error;
    }
  }

  /**
   * Delete secret from Vault
   */
  async deleteSecret(path: string): Promise<void> {
    try {
      await this.client.delete(`/v1/secret/metadata/${path}`);
      
      logger.info('Secret deleted successfully', { path });
    } catch (error) {
      logger.error('Failed to delete secret:', error);
      throw error;
    }
  }

  /**
   * Encrypt data using KMS (additional layer)
   */
  async encryptWithKMS(plaintext: string): Promise<string> {
    if (!this.kmsKeyId) {
      throw new Error('KMS key ID not configured');
    }

    try {
      const command = new EncryptCommand({
        KeyId: this.kmsKeyId,
        Plaintext: Buffer.from(plaintext, 'utf8'),
      });

      const response = await this.kmsClient.send(command);
      const encrypted = Buffer.from(response.CiphertextBlob!).toString('base64');

      logger.debug('Data encrypted with KMS');
      return encrypted;
    } catch (error) {
      logger.error('KMS encryption failed:', error);
      throw error;
    }
  }

  /**
   * Decrypt data using KMS
   */
  async decryptWithKMS(ciphertext: string): Promise<string> {
    try {
      const command = new DecryptCommand({
        CiphertextBlob: Buffer.from(ciphertext, 'base64'),
      });

      const response = await this.kmsClient.send(command);
      const decrypted = Buffer.from(response.Plaintext!).toString('utf8');

      logger.debug('Data decrypted with KMS');
      return decrypted;
    } catch (error) {
      logger.error('KMS decryption failed:', error);
      throw error;
    }
  }

  /**
   * Generate dynamic secret (database credentials, etc.)
   */
  async generateDynamicSecret(engine: string, role: string): Promise<any> {
    try {
      const response = await this.client.get(`/v1/${engine}/creds/${role}`);
      
      logger.info('Dynamic secret generated', { engine, role });
      return response.data.data;
    } catch (error) {
      logger.error('Failed to generate dynamic secret:', error);
      throw error;
    }
  }

  /**
   * Renew token lease
   */
  async renewToken(): Promise<void> {
    if (!this.token) {
      throw new Error('No token to renew');
    }

    try {
      const response = await this.client.post('/v1/auth/token/renew-self');
      
      const leaseDuration = response.data.auth.lease_duration;
      this.tokenExpiry = new Date(Date.now() + (leaseDuration * 1000 * 0.9));

      logger.info('Token renewed successfully', { leaseDuration });
    } catch (error) {
      logger.error('Failed to renew token:', error);
      throw error;
    }
  }

  /**
   * Check Vault health
   */
  async healthCheck(): Promise<{ sealed: boolean; initialized: boolean; standby: boolean }> {
    try {
      const response = await axios.get(`${this.config.address}/v1/sys/health`, {
        timeout: 5000,
        validateStatus: () => true, // Accept all status codes
      });

      return {
        sealed: response.status === 503,
        initialized: response.status !== 501,
        standby: response.status === 429,
      };
    } catch (error) {
      logger.error('Vault health check failed:', error);
      throw error;
    }
  }

  /**
   * Get current configuration (for debugging)
   */
  getConfig(): Omit<VaultConfig, 'token'> {
    return {
      address: this.config.address,
      authMethod: this.config.authMethod,
      role: this.config.role,
      authPath: this.config.authPath,
      namespace: this.config.namespace,
      timeout: this.config.timeout,
    };
  }
}

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { ulid } from 'ulid';

export interface ApiKeyData {
  keyId: string;
  plainKey: string;
  hashedKey: string;
}

/**
 * Generate a new API key with secure random data
 */
export function generateApiKey(): ApiKeyData {
  // Generate unique key ID using ULID for sortability
  const keyId = ulid();
  
  // Generate secure random key (32 bytes = 256 bits)
  const randomBytes = crypto.randomBytes(32);
  const plainKey = `gk_${randomBytes.toString('base64url')}`;
  
  // Hash the key for storage
  const saltRounds = 12;
  const hashedKey = bcrypt.hashSync(plainKey, saltRounds);
  
  return {
    keyId,
    plainKey,
    hashedKey,
  };
}

/**
 * Verify an API key against its hash
 */
export function verifyApiKey(plainKey: string, hashedKey: string): boolean {
  try {
    return bcrypt.compareSync(plainKey, hashedKey);
  } catch (error) {
    return false;
  }
}

/**
 * Extract key ID from a full API key
 */
export function extractKeyId(apiKey: string): string | null {
  // API keys are in format: gk_<base64url>
  if (!apiKey.startsWith('gk_')) {
    return null;
  }
  
  try {
    // For now, we'll need to look up by the full key
    // In a production system, you might encode the keyId in the key itself
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Validate API key format
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  // Check if it starts with our prefix and has reasonable length
  return apiKey.startsWith('gk_') && apiKey.length > 10 && apiKey.length < 100;
}

/**
 * Generate a masked version of an API key for logging
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return '***';
  }
  
  const prefix = apiKey.substring(0, 6);
  const suffix = apiKey.substring(apiKey.length - 4);
  return `${prefix}...${suffix}`;
}

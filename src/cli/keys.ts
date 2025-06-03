#!/usr/bin/env node

import { Command } from 'commander';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import * as readline from 'readline';
import { AppDataSource, initializeDatabase } from '../config/database';
import { TenantEntity } from '../entities/Tenant';
import { ApiKeyEntity, ApiKeyScope } from '../entities/ApiKey';
import { AuthService } from '../services/AuthService';

const program = new Command();

async function initializeCLI() {
  await initializeDatabase();
}

async function secureKeyDisplay(apiKey: string): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\n🔐 SECURITY WARNING:');
    console.log('   The API key will be displayed ONCE and cannot be recovered.');
    console.log('   Ensure you are in a secure environment and ready to copy it.');

    rl.question('\nType "SHOW" to display the key (or anything else to skip): ', (answer) => {
      if (answer.trim().toUpperCase() === 'SHOW') {
        console.log('\n🔑 API Key (copy immediately):');
        console.log(`   ${apiKey}`);
        console.log('\n⚠️  Key displayed. Store it securely and press Enter to continue...');

        rl.question('', () => {
          // Clear the screen to remove the key from terminal history
          console.clear();
          console.log('✅ Key display completed. Terminal cleared for security.');
          rl.close();
          resolve();
        });
      } else {
        console.log('✅ Key display skipped. Use the key ID to reference this key.');
        rl.close();
        resolve();
      }
    });
  });
}

// Create tenant command
program
  .command('tenant:create')
  .description('Create a new tenant')
  .requiredOption('-n, --name <name>', 'Tenant name')
  .requiredOption('-e, --email <email>', 'Tenant email')
  .option('-o, --organization <org>', 'Organization name')
  .option('-p, --plan <plan>', 'Plan type', 'trial')
  .action(async (options) => {
    try {
      await initializeCLI();
      
      const tenantRepository = AppDataSource.getRepository(TenantEntity);
      
      // Generate slug from name
      const slug = options.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
      
      const tenant = new TenantEntity();
      tenant.id = ulid();
      tenant.name = options.name;
      tenant.slug = slug;
      tenant.email = options.email;
      tenant.organization = options.organization;
      tenant.plan = options.plan;
      
      const savedTenant = await tenantRepository.save(tenant);
      
      console.log('✅ Tenant created successfully:');
      console.log(`   ID: ${savedTenant.id}`);
      console.log(`   Name: ${savedTenant.name}`);
      console.log(`   Email: ${savedTenant.email}`);
      console.log(`   Plan: ${savedTenant.plan}`);
      
    } catch (error) {
      console.error('❌ Error creating tenant:', error);
      process.exit(1);
    } finally {
      await AppDataSource.destroy();
    }
  });

// List tenants command
program
  .command('tenant:list')
  .description('List all tenants')
  .action(async () => {
    try {
      await initializeCLI();
      
      const tenantRepository = AppDataSource.getRepository(TenantEntity);
      const tenants = await tenantRepository.find({
        order: { createdAt: 'DESC' }
      });
      
      console.log('\n📋 Tenants:');
      console.log('─'.repeat(80));
      
      if (tenants.length === 0) {
        console.log('No tenants found.');
      } else {
        tenants.forEach(tenant => {
          console.log(`${tenant.active ? '🟢' : '🔴'} ${tenant.name} (${tenant.plan})`);
          console.log(`   ID: ${tenant.id}`);
          console.log(`   Email: ${tenant.email}`);
          console.log(`   Created: ${tenant.createdAt.toISOString()}`);
          console.log('');
        });
      }
      
    } catch (error) {
      console.error('❌ Error listing tenants:', error);
      process.exit(1);
    } finally {
      await AppDataSource.destroy();
    }
  });

// Create API key command
program
  .command('keys:create')
  .description('Create a new API key')
  .requiredOption('-t, --tenant <tenantId>', 'Tenant ID')
  .requiredOption('-n, --name <name>', 'API key name')
  .requiredOption('-s, --scopes <scopes>', 'Comma-separated scopes', (value) => {
    return value.split(',').map(s => s.trim() as ApiKeyScope);
  })
  .option('-e, --expires <date>', 'Expiration date (ISO format)')
  .action(async (options) => {
    try {
      await initializeCLI();
      
      const authService = new AuthService();
      
      const expiresAt = options.expires ? new Date(options.expires) : undefined;
      
      const apiKey = await authService.createApiKey({
        tenantId: options.tenant,
        name: options.name,
        scopes: options.scopes,
        expiresAt,
      });
      
      console.log('✅ API key created successfully:');
      console.log(`   ID: ${apiKey.id}`);
      console.log(`   Name: ${apiKey.name}`);
      console.log(`   Prefix: ${apiKey.keyPrefix}`);
      console.log(`   Scopes: ${apiKey.scopes.join(', ')}`);
      if (apiKey.expiresAt) {
        console.log(`   Expires: ${apiKey.expiresAt.toISOString()}`);
      }

      // Secure key display with user confirmation
      await secureKeyDisplay(apiKey.key);
      
    } catch (error) {
      console.error('❌ Error creating API key:', error);
      process.exit(1);
    } finally {
      await AppDataSource.destroy();
    }
  });

// List API keys command
program
  .command('keys:list')
  .description('List API keys for a tenant')
  .requiredOption('-t, --tenant <tenantId>', 'Tenant ID')
  .action(async (options) => {
    try {
      await initializeCLI();
      
      const authService = new AuthService();
      const apiKeys = await authService.listApiKeys(options.tenant);
      
      console.log('\n🔑 API Keys:');
      console.log('─'.repeat(80));
      
      if (apiKeys.length === 0) {
        console.log('No API keys found for this tenant.');
      } else {
        apiKeys.forEach(key => {
          console.log(`${key.active ? '🟢' : '🔴'} ${key.name}`);
          console.log(`   ID: ${key.id}`);
          console.log(`   Prefix: ${key.keyPrefix}`);
          console.log(`   Scopes: ${key.scopes.join(', ')}`);
          console.log(`   Usage: ${key.usageCount} times`);
          if (key.lastUsedAt) {
            console.log(`   Last used: ${key.lastUsedAt.toISOString()}`);
          }
          if (key.expiresAt) {
            console.log(`   Expires: ${key.expiresAt.toISOString()}`);
          }
          console.log(`   Created: ${key.createdAt.toISOString()}`);
          console.log('');
        });
      }
      
    } catch (error) {
      console.error('❌ Error listing API keys:', error);
      process.exit(1);
    } finally {
      await AppDataSource.destroy();
    }
  });

// Revoke API key command
program
  .command('keys:revoke')
  .description('Revoke an API key')
  .requiredOption('-k, --key <keyId>', 'API key ID')
  .requiredOption('-t, --tenant <tenantId>', 'Tenant ID')
  .action(async (options) => {
    try {
      await initializeCLI();
      
      const authService = new AuthService();
      await authService.revokeApiKey(options.key, options.tenant);
      
      console.log('✅ API key revoked successfully');
      
    } catch (error) {
      console.error('❌ Error revoking API key:', error);
      process.exit(1);
    } finally {
      await AppDataSource.destroy();
    }
  });

// Show available scopes
program
  .command('scopes:list')
  .description('List available API key scopes')
  .action(() => {
    console.log('\n🔐 Available API Key Scopes:');
    console.log('─'.repeat(50));
    
    Object.values(ApiKeyScope).forEach(scope => {
      console.log(`   ${scope}`);
    });
    
    console.log('\nExample usage:');
    console.log('npm run cli:keys keys:create -t <tenant-id> -n "My API Key" -s "guard:read,guard:write"');
  });

program
  .name('guardagent-keys')
  .description('GuardAgent API Key Management CLI')
  .version('1.0.0');

program.parse();

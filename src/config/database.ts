import { DataSource } from 'typeorm';
import { DSRTicketEntity } from '../entities/DSRTicket';
import { TenantEntity } from '../entities/Tenant';
import { ApiKeyEntity } from '../entities/ApiKey';
import { RoleEntity, DEFAULT_ROLES } from '../entities/Role';
import { HashChainEntity } from '../entities/HashChain';
import pino from 'pino';

const logger = pino({
  name: 'core:database',
  level: process.env.LOG_LEVEL || 'info',
});

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME || 'guardagent',
  password: process.env.DB_PASSWORD || 'guardagent',
  database: process.env.DB_NAME || 'guardagent_tickets',
  synchronize: process.env.NODE_ENV === 'development',
  logging: process.env.NODE_ENV === 'development',
  entities: [DSRTicketEntity, TenantEntity, ApiKeyEntity, RoleEntity, HashChainEntity],
  migrations: ['src/migrations/*.ts'],
  subscribers: ['src/subscribers/*.ts'],
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
});

export async function initializeDatabase(): Promise<void> {
  try {
    await AppDataSource.initialize();
    logger.info('Database connection established successfully');
    
    // Run migrations in production
    if (process.env.NODE_ENV === 'production') {
      await AppDataSource.runMigrations();
      logger.info('Database migrations completed');
    }

    // Seed default roles
    await seedDefaultRoles();
  } catch (error) {
    logger.error('Error during database initialization:', error);
    throw error;
  }
}

export async function closeDatabase(): Promise<void> {
  try {
    await AppDataSource.destroy();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
}

async function seedDefaultRoles(): Promise<void> {
  try {
    const roleRepository = AppDataSource.getRepository(RoleEntity);

    for (const roleData of DEFAULT_ROLES) {
      const existingRole = await roleRepository.findOne({
        where: { name: roleData.name }
      });

      if (!existingRole) {
        const role = new RoleEntity();
        role.name = roleData.name;
        role.description = roleData.description;
        role.permissions = roleData.permissions;

        await roleRepository.save(role);
        logger.info(`Default role created: ${roleData.name}`);
      }
    }
  } catch (error) {
    logger.error('Error seeding default roles:', error);
  }
}

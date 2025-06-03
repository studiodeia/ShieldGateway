import { MigrationInterface, QueryRunner, Table, Index, ForeignKey } from 'typeorm';

export class CreateTenantsApikeysRoles20250602 implements MigrationInterface {
  name = 'CreateTenantsApikeysRoles20250602';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create tenants table
    await queryRunner.createTable(
      new Table({
        name: 'tenants',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'slug',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'organization',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'plan',
            type: 'varchar',
            length: '50',
            default: "'trial'",
          },
          {
            name: 'monthlyQuota',
            type: 'integer',
            default: 1000,
          },
          {
            name: 'currentUsage',
            type: 'integer',
            default: 0,
          },
          {
            name: 'quotaResetAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    // Create roles table
    await queryRunner.createTable(
      new Table({
        name: 'roles',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'name',
            type: 'enum',
            enum: ['viewer', 'manager'],
            isUnique: true,
          },
          {
            name: 'description',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'permissions',
            type: 'enum',
            enum: [
              'guard:read',
              'guard:write',
              'dsr:read',
              'dsr:write',
              'dsr:approve',
              'dpia:read',
              'dpia:write',
              'metrics:read',
              'tenant:manage',
              'keys:manage',
              'users:manage'
            ],
            isArray: true,
          },
          {
            name: 'active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    // Create api_keys table
    await queryRunner.createTable(
      new Table({
        name: 'api_keys',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'keyHash',
            type: 'varchar',
            length: '64',
            isUnique: true,
          },
          {
            name: 'keyPrefix',
            type: 'varchar',
            length: '16',
          },
          {
            name: 'tenantId',
            type: 'uuid',
          },
          {
            name: 'scopes',
            type: 'enum',
            enum: [
              'guard:read',
              'guard:write',
              'dsr:read',
              'dsr:write',
              'dpia:read',
              'dpia:write',
              'metrics:read',
              'admin'
            ],
            isArray: true,
          },
          {
            name: 'active',
            type: 'boolean',
            default: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastUsedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'usageCount',
            type: 'integer',
            default: 0,
          },
          {
            name: 'lastUsedIp',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true
    );

    // Create indexes
    await queryRunner.createIndex(
      'api_keys',
      new Index({
        name: 'IDX_api_keys_keyHash',
        columnNames: ['keyHash'],
      })
    );

    await queryRunner.createIndex(
      'api_keys',
      new Index({
        name: 'IDX_api_keys_tenantId_active',
        columnNames: ['tenantId', 'active'],
      })
    );

    // Create hash_chain table
    await queryRunner.createTable(
      new Table({
        name: 'hash_chain',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'sequenceNumber',
            type: 'bigint',
            isUnique: true,
          },
          {
            name: 'currentHash',
            type: 'varchar',
            length: '64',
          },
          {
            name: 'previousHash',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          {
            name: 'requestId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'method',
            type: 'varchar',
            length: '10',
          },
          {
            name: 'url',
            type: 'text',
          },
          {
            name: 'statusCode',
            type: 'integer',
          },
          {
            name: 'responseTime',
            type: 'integer',
          },
          {
            name: 'ip',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'tenantId',
            type: 'uuid',
            isNullable: true,
          },
          {
            name: 'complianceMetadata',
            type: 'jsonb',
          },
          {
            name: 's3Key',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'logTimestamp',
            type: 'timestamp',
          },
        ],
      }),
      true
    );

    // Create indexes for hash_chain
    await queryRunner.createIndex(
      'hash_chain',
      new Index({
        name: 'IDX_hash_chain_sequenceNumber',
        columnNames: ['sequenceNumber'],
        isUnique: true,
      })
    );

    // Create foreign key
    await queryRunner.createForeignKey(
      'api_keys',
      new ForeignKey({
        columnNames: ['tenantId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'tenants',
        onDelete: 'CASCADE',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys
    const table = await queryRunner.getTable('api_keys');
    const foreignKey = table!.foreignKeys.find(fk => fk.columnNames.indexOf('tenantId') !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey('api_keys', foreignKey);
    }

    // Drop indexes
    await queryRunner.dropIndex('api_keys', 'IDX_api_keys_keyHash');
    await queryRunner.dropIndex('api_keys', 'IDX_api_keys_tenantId_active');
    await queryRunner.dropIndex('hash_chain', 'IDX_hash_chain_sequenceNumber');

    // Drop tables
    await queryRunner.dropTable('hash_chain');
    await queryRunner.dropTable('api_keys');
    await queryRunner.dropTable('roles');
    await queryRunner.dropTable('tenants');
  }
}

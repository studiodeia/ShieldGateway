import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { TenantEntity } from './Tenant';

export enum ApiKeyScope {
  GUARD_READ = 'guard:read',
  GUARD_WRITE = 'guard:write',
  DSR_READ = 'dsr:read',
  DSR_WRITE = 'dsr:write',
  DPIA_READ = 'dpia:read',
  DPIA_WRITE = 'dpia:write',
  METRICS_READ = 'metrics:read',
  ADMIN = 'admin'
}

@Entity('api_keys')
@Index(['keyHash'])
@Index(['tenantId', 'active'])
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  keyHash!: string; // SHA-256 hash of the API key

  @Column({ type: 'varchar', length: 16 })
  keyPrefix!: string; // First 8 chars for identification (ga_live_12345678)

  @Column({ type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'enum', enum: ApiKeyScope, array: true })
  scopes!: ApiKeyScope[];

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt?: Date;

  @Column({ type: 'integer', default: 0 })
  usageCount!: number;

  @Column({ type: 'varchar', length: 45, nullable: true })
  lastUsedIp?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @ManyToOne(() => TenantEntity, tenant => tenant.apiKeys)
  @JoinColumn({ name: 'tenantId' })
  tenant!: TenantEntity;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { ApiKeyEntity } from './ApiKey';

@Entity('tenants')
export class TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  organization?: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'varchar', length: 50, default: 'trial' })
  plan!: string; // trial, basic, pro, enterprise

  @Column({ type: 'integer', default: 1000 })
  monthlyQuota!: number;

  @Column({ type: 'integer', default: 0 })
  currentUsage!: number;

  @Column({ type: 'timestamp', nullable: true })
  quotaResetAt?: Date;

  @Column({ type: 'integer', default: 80 })
  riskBlockThreshold!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.5 })
  riskProfile!: number; // 0.0 - 1.0, calculated based on historical data

  @Column({ type: 'timestamp', nullable: true })
  riskProfileUpdatedAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => ApiKeyEntity, apiKey => apiKey.tenant)
  apiKeys!: ApiKeyEntity[];
}

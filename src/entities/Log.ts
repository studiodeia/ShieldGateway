import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('logs')
@Index(['tenantId'])
@Index(['action'])
@Index(['riskLevel'])
@Index(['createdAt'])
@Index(['requestId'])
export class LogEntity {
  @PrimaryColumn('varchar', { length: 26 })
  id!: string;

  @Column('varchar', { length: 26 })
  @Index()
  tenantId!: string;

  @Column('varchar', { length: 50 })
  @Index()
  requestId!: string;

  @Column({
    type: 'enum',
    enum: ['ALLOW', 'BLOCK', 'REVIEW'],
  })
  action!: 'ALLOW' | 'BLOCK' | 'REVIEW';

  @Column({
    type: 'enum',
    enum: ['LOW', 'MEDIUM', 'HIGH'],
  })
  riskLevel!: 'LOW' | 'MEDIUM' | 'HIGH';

  @Column('decimal', { precision: 3, scale: 2 })
  riskScore!: number;

  @Column('text')
  content!: string;

  @Column('text', { nullable: true })
  maskedContent?: string;

  @Column('varchar', { length: 10, nullable: true })
  method?: string; // GET, POST, etc.

  @Column('varchar', { length: 255, nullable: true })
  endpoint?: string; // API endpoint

  @Column('int', { nullable: true })
  statusCode?: number; // HTTP status code

  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  timestamp!: Date; // Alias for createdAt for backward compatibility

  @Column('json', { nullable: true })
  detectedThreats?: string[];

  @Column('json', { nullable: true })
  detectedPII?: string[];

  @Column('varchar', { length: 50, nullable: true })
  stage?: string;

  @Column('varchar', { length: 100, nullable: true })
  userAgent?: string;

  @Column('varchar', { length: 45, nullable: true })
  ipAddress?: string;

  @Column('int', { nullable: true })
  responseTime?: number;

  @Column('varchar', { length: 26, nullable: true })
  apiKeyId?: string;

  @Column('json', { nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt!: Date;

  @Column('varchar', { length: 64, nullable: true })
  hashChainId?: string;

  @Column('boolean', { default: false })
  isWormLogged!: boolean;

  @Column('varchar', { length: 255, nullable: true })
  s3ObjectKey?: string;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('hash_chain')
@Index(['sequenceNumber'], { unique: true })
export class HashChainEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'bigint', unique: true })
  sequenceNumber!: number;

  @Column({ type: 'varchar', length: 64 })
  currentHash!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  previousHash?: string;

  @Column({ type: 'varchar', length: 255 })
  requestId!: string;

  @Column({ type: 'varchar', length: 10 })
  method!: string;

  @Column({ type: 'text' })
  url!: string;

  @Column({ type: 'integer' })
  statusCode!: number;

  @Column({ type: 'integer' })
  responseTime!: number;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip?: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'jsonb' })
  complianceMetadata!: any;

  @Column({ type: 'varchar', length: 255, nullable: true })
  s3Key?: string; // Reference to S3 object

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp' })
  logTimestamp!: Date;
}

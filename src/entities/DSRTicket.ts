import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('dsr_tickets')
@Index(['email'])
@Index(['status'])
@Index(['type'])
@Index(['createdAt'])
@Index(['slaDeadline'])
export class DSRTicketEntity {
  @PrimaryColumn('varchar', { length: 26 })
  id: string;

  @Column({
    type: 'enum',
    enum: ['access', 'rectification', 'erasure', 'portability', 'objection', 'complaint'],
  })
  type: 'access' | 'rectification' | 'erasure' | 'portability' | 'objection' | 'complaint';

  @Column({
    type: 'enum',
    enum: ['pending', 'in_progress', 'completed', 'rejected', 'cancelled'],
    default: 'pending',
  })
  status: 'pending' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';

  @Column('varchar', { length: 255 })
  @Index()
  dataSubjectId: string;

  @Column('varchar', { length: 255 })
  email: string;

  @Column('text')
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column('timestamp')
  @Index()
  slaDeadline: Date;

  @Column('text', { nullable: true })
  resolution?: string;

  @Column('varchar', { length: 255, nullable: true })
  assignedTo?: string;

  @Column('json', { nullable: true })
  documents?: string[];

  @Column('json', { nullable: true })
  metadata?: {
    source: string;
    userAgent?: string;
    ip?: string;
    requestId?: string;
  };

  @Column('varchar', { length: 50, nullable: true })
  priority?: 'low' | 'medium' | 'high' | 'critical';

  @Column('text', { nullable: true })
  internalNotes?: string;

  @Column('timestamp', { nullable: true })
  completedAt?: Date;

  @Column('boolean', { default: false })
  dpoNotified: boolean;

  @Column('timestamp', { nullable: true })
  lastNotificationSent?: Date;
}

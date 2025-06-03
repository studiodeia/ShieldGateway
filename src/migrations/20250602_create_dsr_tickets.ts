import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateDSRTickets20250602 implements MigrationInterface {
  name = 'CreateDSRTickets20250602';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'dsr_tickets',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '26',
            isPrimary: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['access', 'rectification', 'erasure', 'portability', 'objection', 'complaint'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending', 'in_progress', 'completed', 'rejected', 'cancelled'],
            default: "'pending'",
          },
          {
            name: 'dataSubjectId',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
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
            onUpdate: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'slaDeadline',
            type: 'timestamp',
          },
          {
            name: 'resolution',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'assignedTo',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'documents',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'priority',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'internalNotes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'completedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'dpoNotified',
            type: 'boolean',
            default: false,
          },
          {
            name: 'lastNotificationSent',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true
    );

    // Create indexes for better performance
    await queryRunner.createIndex(
      'dsr_tickets',
      new Index('IDX_dsr_tickets_email', ['email'])
    );

    await queryRunner.createIndex(
      'dsr_tickets',
      new Index('IDX_dsr_tickets_status', ['status'])
    );

    await queryRunner.createIndex(
      'dsr_tickets',
      new Index('IDX_dsr_tickets_type', ['type'])
    );

    await queryRunner.createIndex(
      'dsr_tickets',
      new Index('IDX_dsr_tickets_created_at', ['createdAt'])
    );

    await queryRunner.createIndex(
      'dsr_tickets',
      new Index('IDX_dsr_tickets_sla_deadline', ['slaDeadline'])
    );

    await queryRunner.createIndex(
      'dsr_tickets',
      new Index('IDX_dsr_tickets_data_subject_id', ['dataSubjectId'])
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('dsr_tickets');
  }
}

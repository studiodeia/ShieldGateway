import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum RoleType {
  VIEWER = 'viewer',
  MANAGER = 'manager'
}

export enum Permission {
  // Guard permissions
  GUARD_READ = 'guard:read',
  GUARD_WRITE = 'guard:write',
  
  // DSR permissions
  DSR_READ = 'dsr:read',
  DSR_WRITE = 'dsr:write',
  DSR_APPROVE = 'dsr:approve',
  
  // DPIA permissions
  DPIA_READ = 'dpia:read',
  DPIA_WRITE = 'dpia:write',
  
  // Metrics permissions
  METRICS_READ = 'metrics:read',
  
  // Admin permissions
  TENANT_MANAGE = 'tenant:manage',
  KEYS_MANAGE = 'keys:manage',
  USERS_MANAGE = 'users:manage'
}

@Entity('roles')
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: RoleType, unique: true })
  name!: RoleType;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({ type: 'enum', enum: Permission, array: true })
  permissions!: Permission[];

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

// Default role configurations
export const DEFAULT_ROLES = [
  {
    name: RoleType.VIEWER,
    description: 'Read-only access to all resources',
    permissions: [
      Permission.GUARD_READ,
      Permission.DSR_READ,
      Permission.DPIA_READ,
      Permission.METRICS_READ
    ]
  },
  {
    name: RoleType.MANAGER,
    description: 'Full access to manage resources',
    permissions: [
      Permission.GUARD_READ,
      Permission.GUARD_WRITE,
      Permission.DSR_READ,
      Permission.DSR_WRITE,
      Permission.DSR_APPROVE,
      Permission.DPIA_READ,
      Permission.DPIA_WRITE,
      Permission.METRICS_READ,
      Permission.TENANT_MANAGE,
      Permission.KEYS_MANAGE,
      Permission.USERS_MANAGE
    ]
  }
];

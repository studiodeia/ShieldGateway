import 'reflect-metadata';
import { RoleType, Permission } from '../entities/Role';

// Metadata keys for role-based access control
export const ROLE_METADATA_KEY = Symbol('role');
export const PERMISSION_METADATA_KEY = Symbol('permission');

/**
 * Decorator to require specific role for route access
 * @param role Required role
 */
export function RequireRole(role: RoleType) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(ROLE_METADATA_KEY, role, target, propertyKey);
    return descriptor;
  };
}

/**
 * Decorator to require specific permission for route access
 * @param permission Required permission
 */
export function RequirePermission(permission: Permission) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(PERMISSION_METADATA_KEY, permission, target, propertyKey);
    return descriptor;
  };
}

/**
 * Decorator to require any of the specified permissions
 * @param permissions Array of permissions (user needs at least one)
 */
export function RequireAnyPermission(permissions: Permission[]) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(PERMISSION_METADATA_KEY, permissions, target, propertyKey);
    return descriptor;
  };
}

/**
 * Get role metadata from method
 */
export function getRoleMetadata(target: any, propertyKey: string): RoleType | undefined {
  return Reflect.getMetadata(ROLE_METADATA_KEY, target, propertyKey);
}

/**
 * Get permission metadata from method
 */
export function getPermissionMetadata(target: any, propertyKey: string): Permission | Permission[] | undefined {
  return Reflect.getMetadata(PERMISSION_METADATA_KEY, target, propertyKey);
}

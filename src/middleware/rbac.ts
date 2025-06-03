import { Request, Response, NextFunction } from 'express';
import { Repository } from 'typeorm';
import pino from 'pino';
import { AppDataSource } from '../config/database';
import { RoleEntity, RoleType, Permission } from '../entities/Role';
import { ApiKeyScope } from '../entities/ApiKey';

const logger = pino({
  name: 'core:rbac-middleware',
  level: process.env.LOG_LEVEL || 'info',
});

declare global {
  namespace Express {
    interface Request {
      userRole?: RoleType;
      userPermissions?: Permission[];
    }
  }
}

export class RBACMiddleware {
  private roleRepository: Repository<RoleEntity>;

  constructor() {
    this.roleRepository = AppDataSource.getRepository(RoleEntity);
  }

  /**
   * Middleware to determine user role based on API key scopes
   */
  determineRole = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.auth) {
        return next(); // No authentication, no role
      }

      // Determine role based on scopes
      const role = this.mapScopesToRole(req.auth.scopes);
      
      if (role) {
        const roleEntity = await this.roleRepository.findOne({
          where: { name: role, active: true }
        });

        if (roleEntity) {
          req.userRole = role;
          req.userPermissions = roleEntity.permissions;
          
          logger.debug('Role determined', {
            tenantId: req.auth.tenantId,
            role,
            permissions: roleEntity.permissions,
          });
        }
      }

      next();
    } catch (error) {
      logger.error('RBAC middleware error:', error);
      next(); // Continue without role assignment
    }
  };

  /**
   * Middleware to require specific role
   */
  requireRole = (requiredRole: RoleType) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.auth) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          timestamp: new Date().toISOString(),
        });
      }

      if (!req.userRole) {
        return res.status(403).json({
          error: 'No role assigned',
          code: 'NO_ROLE',
          timestamp: new Date().toISOString(),
        });
      }

      if (!this.hasRole(req.userRole, requiredRole)) {
        logger.warn('Insufficient role', {
          tenantId: req.auth.tenantId,
          userRole: req.userRole,
          requiredRole,
        });

        return res.status(403).json({
          error: `Insufficient role. Required: ${requiredRole}`,
          code: 'INSUFFICIENT_ROLE',
          userRole: req.userRole,
          requiredRole,
          timestamp: new Date().toISOString(),
        });
      }

      next();
    };
  };

  /**
   * Middleware to require specific permission
   */
  requirePermission = (requiredPermission: Permission) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.auth) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          timestamp: new Date().toISOString(),
        });
      }

      if (!req.userPermissions) {
        return res.status(403).json({
          error: 'No permissions assigned',
          code: 'NO_PERMISSIONS',
          timestamp: new Date().toISOString(),
        });
      }

      if (!req.userPermissions.includes(requiredPermission)) {
        logger.warn('Insufficient permission', {
          tenantId: req.auth.tenantId,
          userPermissions: req.userPermissions,
          requiredPermission,
        });

        return res.status(403).json({
          error: `Insufficient permission. Required: ${requiredPermission}`,
          code: 'INSUFFICIENT_PERMISSION',
          userPermissions: req.userPermissions,
          requiredPermission,
          timestamp: new Date().toISOString(),
        });
      }

      next();
    };
  };

  /**
   * Middleware to require any of the specified permissions
   */
  requireAnyPermission = (requiredPermissions: Permission[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.auth) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          timestamp: new Date().toISOString(),
        });
      }

      if (!req.userPermissions) {
        return res.status(403).json({
          error: 'No permissions assigned',
          code: 'NO_PERMISSIONS',
          timestamp: new Date().toISOString(),
        });
      }

      const hasAnyPermission = requiredPermissions.some(permission =>
        req.userPermissions!.includes(permission)
      );

      if (!hasAnyPermission) {
        logger.warn('Insufficient permissions', {
          tenantId: req.auth.tenantId,
          userPermissions: req.userPermissions,
          requiredPermissions,
        });

        return res.status(403).json({
          error: `Insufficient permissions. Required one of: ${requiredPermissions.join(', ')}`,
          code: 'INSUFFICIENT_PERMISSIONS',
          userPermissions: req.userPermissions,
          requiredPermissions,
          timestamp: new Date().toISOString(),
        });
      }

      next();
    };
  };

  /**
   * Map API key scopes to role
   */
  private mapScopesToRole(scopes: ApiKeyScope[]): RoleType | null {
    // Admin scope gets manager role
    if (scopes.includes(ApiKeyScope.ADMIN)) {
      return RoleType.MANAGER;
    }

    // Check for write permissions (manager role)
    const writeScopes = [
      ApiKeyScope.GUARD_WRITE,
      ApiKeyScope.DSR_WRITE,
      ApiKeyScope.DPIA_WRITE,
    ];

    if (writeScopes.some(scope => scopes.includes(scope))) {
      return RoleType.MANAGER;
    }

    // Only read permissions (viewer role)
    const readScopes = [
      ApiKeyScope.GUARD_READ,
      ApiKeyScope.DSR_READ,
      ApiKeyScope.DPIA_READ,
      ApiKeyScope.METRICS_READ,
    ];

    if (readScopes.some(scope => scopes.includes(scope))) {
      return RoleType.VIEWER;
    }

    return null;
  }

  /**
   * Check if user role has required role privileges
   */
  private hasRole(userRole: RoleType, requiredRole: RoleType): boolean {
    // Manager role has all privileges
    if (userRole === RoleType.MANAGER) {
      return true;
    }

    // Exact role match
    return userRole === requiredRole;
  }
}

// Export singleton instance
export const rbacMiddleware = new RBACMiddleware();

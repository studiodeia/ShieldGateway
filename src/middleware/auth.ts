import { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { AuthService, AuthenticatedContext } from '../services/AuthService';
import { ApiKeyScope } from '../entities/ApiKey';

const logger = pino({
  name: 'core:auth-middleware',
  level: process.env.LOG_LEVEL || 'info',
});

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedContext;
    }
  }
}

export class AuthMiddleware {
  private authService: AuthService;

  constructor() {
    this.authService = new AuthService();
  }

  /**
   * Middleware to authenticate requests using API key or JWT
   */
  authenticate = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({
          error: 'Missing authorization header',
          code: 'MISSING_AUTH',
          timestamp: new Date().toISOString(),
        });
      }

      let token: string;
      
      if (authHeader.startsWith('Bearer ')) {
        // JWT token
        token = authHeader.substring(7);
        
        try {
          const context = await this.authService.verifyToken(token);
          req.auth = context;
          
          logger.debug('JWT authentication successful', {
            tenantId: context.tenantId,
            keyId: context.apiKey.id,
            scopes: context.scopes,
          });
          
          return next();
        } catch (error) {
          logger.debug('JWT verification failed:', error);
          return res.status(401).json({
            error: 'Invalid or expired token',
            code: 'INVALID_TOKEN',
            timestamp: new Date().toISOString(),
          });
        }
      } else if (authHeader.startsWith('ApiKey ')) {
        // API Key - exchange for JWT
        const apiKey = authHeader.substring(7);
        
        try {
          const jwtToken = await this.authService.authenticateApiKey(apiKey);
          const context = await this.authService.verifyToken(jwtToken);
          req.auth = context;
          
          // Add JWT to response header for client caching
          res.setHeader('X-JWT-Token', jwtToken);
          
          logger.debug('API key authentication successful', {
            tenantId: context.tenantId,
            keyId: context.apiKey.id,
            keyPrefix: context.apiKey.keyPrefix,
          });
          
          return next();
        } catch (error) {
          logger.debug('API key authentication failed:', error);
          return res.status(401).json({
            error: 'Invalid API key',
            code: 'INVALID_API_KEY',
            timestamp: new Date().toISOString(),
          });
        }
      } else {
        return res.status(401).json({
          error: 'Invalid authorization format. Use "Bearer <jwt>" or "ApiKey <key>"',
          code: 'INVALID_AUTH_FORMAT',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error('Authentication middleware error:', error);
      return res.status(500).json({
        error: 'Internal authentication error',
        code: 'AUTH_ERROR',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * Middleware to require specific scopes
   */
  requireScope = (requiredScope: ApiKeyScope) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.auth) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          timestamp: new Date().toISOString(),
        });
      }

      if (!this.authService.hasScope(req.auth, requiredScope)) {
        logger.warn('Insufficient scope', {
          tenantId: req.auth.tenantId,
          requiredScope,
          availableScopes: req.auth.scopes,
        });

        return res.status(403).json({
          error: `Insufficient permissions. Required scope: ${requiredScope}`,
          code: 'INSUFFICIENT_SCOPE',
          requiredScope,
          availableScopes: req.auth.scopes,
          timestamp: new Date().toISOString(),
        });
      }

      next();
    };
  };

  /**
   * Middleware to require any of the specified scopes
   */
  requireAnyScope = (requiredScopes: ApiKeyScope[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.auth) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
          timestamp: new Date().toISOString(),
        });
      }

      const hasAnyScope = requiredScopes.some(scope => 
        this.authService.hasScope(req.auth!, scope)
      );

      if (!hasAnyScope) {
        logger.warn('Insufficient scope', {
          tenantId: req.auth.tenantId,
          requiredScopes,
          availableScopes: req.auth.scopes,
        });

        return res.status(403).json({
          error: `Insufficient permissions. Required one of: ${requiredScopes.join(', ')}`,
          code: 'INSUFFICIENT_SCOPE',
          requiredScopes,
          availableScopes: req.auth.scopes,
          timestamp: new Date().toISOString(),
        });
      }

      next();
    };
  };

  /**
   * Optional authentication - sets auth context if present but doesn't require it
   */
  optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next();
    }

    try {
      await this.authenticate(req, res, next);
    } catch (error) {
      // Log but don't fail the request
      logger.debug('Optional authentication failed:', error);
      next();
    }
  };

  /**
   * JWKS endpoint for public key distribution
   */
  jwks = (req: Request, res: Response) => {
    try {
      const jwks = this.authService.getJWKS();
      res.json(jwks);
    } catch (error) {
      logger.error('JWKS endpoint error:', error);
      res.status(500).json({
        error: 'Failed to retrieve JWKS',
        timestamp: new Date().toISOString(),
      });
    }
  };
}

// Export singleton instance
export const authMiddleware = new AuthMiddleware();

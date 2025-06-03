import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';

export function errorHandler(logger: Logger) {
  return (error: Error, req: Request, res: Response, next: NextFunction) => {
    // Log the error
    logger.error('Unhandled error:', {
      error: error.message,
      stack: error.stack,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
      ...(isDevelopment && {
        details: error.message,
        stack: error.stack,
      }),
    });
  };
}

import { Request, Response, NextFunction } from 'express';
import { Logger } from 'pino';
import { LogService } from '../services/LogService';
import { QueueService } from '../services/QueueService';
import { recordWormLog } from './metrics';

export function requestLogger(logger: Logger, logService?: LogService, queueService?: QueueService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Log request
    logger.info('Request received', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentLength: req.get('Content-Length'),
    });

    // Capturar dados da resposta para WORM logging
    let responseBody: any;
    const originalSend = res.send.bind(res);
    res.send = function(body: any) {
      responseBody = body;
      return originalSend(body);
    };

    // Override res.end to log response and write WORM log
    const originalEnd = res.end.bind(res);
    res.end = function(chunk?: any, encoding?: any, cb?: any) {
      const duration = Date.now() - startTime;

      logger.info('Request completed', {
        requestId: req.requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
      });

      // Write WORM log via queue if available, fallback to direct logging
      if (queueService) {
        // Async logging via queue
        queueService.enqueueLog({
          requestId: req.requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          responseTime: duration,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
          tenantId: req.auth?.tenantId,
          complianceMetadata: req.complianceMetadata,
          timestamp: new Date().toISOString(),
        }).catch((error) => {
          logger.error('Failed to enqueue log:', error);
          recordWormLog('error');

          // Fallback to direct logging
          if (logService) {
            logService.writeLog(
              req.requestId,
              req.method,
              req.url,
              res.statusCode,
              duration,
              req,
              { body: responseBody, getHeaders: () => res.getHeaders() },
              (res as any).securityResult
            ).catch((fallbackError) => {
              logger.error('Fallback WORM log also failed:', fallbackError);
            });
          }
        });
      } else if (logService) {
        // Direct logging (legacy mode)
        logService.writeLog(
          req.requestId,
          req.method,
          req.url,
          res.statusCode,
          duration,
          req,
          { body: responseBody, getHeaders: () => res.getHeaders() },
          (res as any).securityResult
        ).then(() => {
          recordWormLog('success');
        }).catch((error) => {
          logger.error('Failed to write WORM log:', error);
          recordWormLog('error');
        });
      }

      return originalEnd(chunk, encoding, cb);
    };

    next();
  };
}

import { Request, Response, NextFunction } from 'express';
import { ulid } from 'ulid';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

/**
 * Middleware para adicionar request ID único (ULID) e timestamp de início
 */
export function requestId(req: Request, res: Response, next: NextFunction) {
  // Gerar ULID único para a requisição
  req.requestId = ulid();
  req.startTime = Date.now();
  
  // Adicionar request ID ao header de resposta
  res.setHeader('X-Request-ID', req.requestId);
  
  next();
}

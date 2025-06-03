import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { DSRService, DSRRequest } from '../services/DSRService';
import pino from 'pino';

const logger = pino({
  name: 'core:dsr',
  level: process.env.LOG_LEVEL || 'info',
});

const router = Router();
const dsrService = new DSRService();

// Schema de validação para requisições DSR
const DSRRequestSchema = z.object({
  type: z.enum(['access', 'rectification', 'erasure', 'portability', 'objection', 'complaint']),
  dataSubjectId: z.string().optional(),
  email: z.string().email('Email inválido'),
  description: z.string().min(10, 'Descrição deve ter pelo menos 10 caracteres').max(2000, 'Descrição muito longa'),
  attachments: z.array(z.string()).optional(),
  metadata: z.object({
    source: z.string().optional(),
    userAgent: z.string().optional(),
    ip: z.string().optional(),
  }).optional(),
});

/**
 * POST /v1/dsr/access
 * Solicitação de acesso aos dados pessoais (Art. 18 LGPD / Art. 15 GDPR)
 */
router.post('/access', async (req: Request, res: Response) => {
  try {
    const requestData = {
      ...req.body,
      type: 'access' as const,
      metadata: {
        source: 'api',
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      },
    };
    
    const validatedRequest = DSRRequestSchema.parse(requestData);
    
    logger.info('DSR access request received', {
      requestId: (req as any).requestId,
      email: validatedRequest.email,
      dataSubjectId: validatedRequest.dataSubjectId,
      ip: req.ip,
    });
    
    const response = await dsrService.createTicket(validatedRequest);
    
    res.status(201).json({
      success: true,
      message: 'Solicitação de acesso recebida com sucesso',
      ticket: response,
      legalInfo: {
        basis: 'LGPD Art. 18, I / GDPR Art. 15',
        sla: '15 dias úteis',
        rights: 'Você tem direito de acessar seus dados pessoais que processamos',
      },
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: error.errors,
      });
    }
    
    logger.error('DSR access request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
    });
  }
});

/**
 * POST /v1/dsr/erasure
 * Solicitação de exclusão de dados pessoais (Art. 18 LGPD / Art. 17 GDPR)
 */
router.post('/erasure', async (req: Request, res: Response) => {
  try {
    const requestData = {
      ...req.body,
      type: 'erasure' as const,
      metadata: {
        source: 'api',
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      },
    };
    
    const validatedRequest = DSRRequestSchema.parse(requestData);
    
    logger.info('DSR erasure request received', {
      requestId: (req as any).requestId,
      email: validatedRequest.email,
      dataSubjectId: validatedRequest.dataSubjectId,
      ip: req.ip,
    });
    
    const response = await dsrService.createTicket(validatedRequest);
    
    res.status(201).json({
      success: true,
      message: 'Solicitação de exclusão recebida com sucesso',
      ticket: response,
      legalInfo: {
        basis: 'LGPD Art. 18, II / GDPR Art. 17',
        sla: '30 dias',
        rights: 'Você tem direito de solicitar a exclusão de seus dados pessoais',
        limitations: 'A exclusão pode ser limitada por obrigações legais ou interesses legítimos',
      },
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: error.errors,
      });
    }
    
    logger.error('DSR erasure request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
    });
  }
});

/**
 * POST /v1/dsr/rectification
 * Solicitação de correção de dados pessoais (Art. 18 LGPD / Art. 16 GDPR)
 */
router.post('/rectification', async (req: Request, res: Response) => {
  try {
    const requestData = {
      ...req.body,
      type: 'rectification' as const,
      metadata: {
        source: 'api',
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      },
    };
    
    const validatedRequest = DSRRequestSchema.parse(requestData);
    
    const response = await dsrService.createTicket(validatedRequest);
    
    res.status(201).json({
      success: true,
      message: 'Solicitação de correção recebida com sucesso',
      ticket: response,
      legalInfo: {
        basis: 'LGPD Art. 18, III / GDPR Art. 16',
        sla: '5 dias úteis',
        rights: 'Você tem direito de corrigir dados pessoais incompletos, inexatos ou desatualizados',
      },
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: error.errors,
      });
    }
    
    logger.error('DSR rectification request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
    });
  }
});

/**
 * POST /v1/dsr/portability
 * Solicitação de portabilidade de dados (Art. 18 LGPD / Art. 20 GDPR)
 */
router.post('/portability', async (req: Request, res: Response) => {
  try {
    const requestData = {
      ...req.body,
      type: 'portability' as const,
      metadata: {
        source: 'api',
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      },
    };
    
    const validatedRequest = DSRRequestSchema.parse(requestData);
    
    const response = await dsrService.createTicket(validatedRequest);
    
    res.status(201).json({
      success: true,
      message: 'Solicitação de portabilidade recebida com sucesso',
      ticket: response,
      legalInfo: {
        basis: 'LGPD Art. 18, V / GDPR Art. 20',
        sla: '15 dias úteis',
        rights: 'Você tem direito de receber seus dados em formato estruturado e portável',
        format: 'Os dados serão fornecidos em formato JSON ou CSV',
      },
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: error.errors,
      });
    }
    
    logger.error('DSR portability request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
    });
  }
});

/**
 * POST /v1/dsr/objection
 * Oposição ao tratamento de dados (Art. 18 LGPD / Art. 21 GDPR)
 */
router.post('/objection', async (req: Request, res: Response) => {
  try {
    const requestData = {
      ...req.body,
      type: 'objection' as const,
      metadata: {
        source: 'api',
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      },
    };
    
    const validatedRequest = DSRRequestSchema.parse(requestData);
    
    const response = await dsrService.createTicket(validatedRequest);
    
    res.status(201).json({
      success: true,
      message: 'Oposição ao tratamento recebida com sucesso',
      ticket: response,
      legalInfo: {
        basis: 'LGPD Art. 18, § 2º / GDPR Art. 21',
        sla: '15 dias úteis',
        rights: 'Você tem direito de se opor ao tratamento de seus dados pessoais',
        evaluation: 'Avaliaremos se há interesses legítimos prevalentes',
      },
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Dados inválidos',
        details: error.errors,
      });
    }
    
    logger.error('DSR objection request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
    });
  }
});

/**
 * GET /v1/dsr/ticket/:ticketId
 * Consultar status de um ticket DSR
 */
router.get('/ticket/:ticketId', async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    
    const ticket = await dsrService.getTicket(ticketId);
    
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: 'Ticket não encontrado',
      });
    }
    
    // Remover informações sensíveis para resposta pública
    const publicTicket = {
      id: ticket.id,
      type: ticket.type,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      slaDeadline: ticket.slaDeadline,
    };
    
    res.json({
      success: true,
      ticket: publicTicket,
    });
    
  } catch (error) {
    logger.error('DSR ticket lookup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
    });
  }
});

/**
 * GET /v1/dsr/statistics
 * Estatísticas públicas (anonimizadas) do DSR
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const stats = dsrService.getStatistics();
    
    res.json({
      success: true,
      statistics: {
        totalTickets: stats.total,
        byStatus: stats.byStatus,
        byType: stats.byType,
        averageResolutionTime: `${stats.avgResolutionTime}h`,
        complianceRate: stats.total > 0 ? Math.round(((stats.total - stats.overdue) / stats.total) * 100) : 100,
      },
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    logger.error('DSR statistics request failed:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
    });
  }
});

export { router as dsrRouter };

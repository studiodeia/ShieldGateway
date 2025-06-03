import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { recordSecurityEvent, recordApiKeyUsage } from '../middleware/metrics';
import { PromptInjectionGuard } from '../services/PromptInjectionGuard';
import { rbacMiddleware } from '../middleware/rbac';
import { Permission } from '../entities/Role';
import { RiskEngine } from '../services/RiskEngine';
import { MailService, AlertContext } from '../services/MailService';

const logger = pino({
  name: 'core:guard',
  level: process.env.LOG_LEVEL || 'info',
});

const promptInjectionGuard = new PromptInjectionGuard();
const riskEngine = RiskEngine.getInstance();
const mailService = MailService.getInstance();

const router = Router();

// Request validation schema
const GuardRequestSchema = z.object({
  content: z.string().min(1).max(100000),
  stage: z.enum(['input', 'tool', 'output']),
  mode: z.enum(['permissive', 'balanced', 'strict']).optional().default('balanced'),
  policy: z.enum(['default', 'highSecurity', 'performance']).optional().default('default'),
  metadata: z.object({
    source: z.string().optional(),
    version: z.string().optional(),
    workflowId: z.string().optional(),
  }).optional(),
});

type GuardRequest = z.infer<typeof GuardRequestSchema>;

interface GuardResponse {
  risk: number;
  blocked: boolean;
  reason: string;
  categories: string[];
  timestamp: string;
  processingTime: number;
}

/**
 * POST /v1/guard
 * Main guard endpoint for content analysis
 */
router.post('/', rbacMiddleware.requirePermission(Permission.GUARD_WRITE), async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Validate request
    const guardRequest: GuardRequest = GuardRequestSchema.parse(req.body);
    
    // Record API key usage
    if (req.auth) {
      recordApiKeyUsage(req.auth.tenantId, req.auth.apiKey.keyPrefix);
    }

    logger.info('Guard request received', {
      stage: guardRequest.stage,
      mode: guardRequest.mode,
      policy: guardRequest.policy,
      contentLength: guardRequest.content.length,
      tenantId: req.auth?.tenantId,
      ip: req.ip,
    });

    // Análise de prompt injection (Sprint 1 - Compliance Core)
    const injectionResult = promptInjectionGuard.analyze(guardRequest.content);

    // Determinar risco e bloqueio baseado na análise
    let risk = injectionResult.confidence;
    let blocked = injectionResult.isInjection;
    let reason = injectionResult.reason;
    let categories = injectionResult.detectedPatterns;

    // Ajustar baseado no modo e política
    if (guardRequest.mode === 'strict') {
      // Modo restrito: bloquear com menor threshold
      if (risk >= 0.3) {
        blocked = true;
        reason = `Modo restrito: ${reason}`;
      }
    } else if (guardRequest.mode === 'permissive') {
      // Modo permissivo: só bloquear riscos críticos
      if (risk < 0.8) {
        blocked = false;
        reason = `Modo permissivo: conteúdo liberado (risco: ${Math.round(risk * 100)}%)`;
      }
    }

    // Política de alta segurança
    if (guardRequest.policy === 'highSecurity' && risk >= 0.2) {
      blocked = true;
      reason = `Política de alta segurança: ${reason}`;
    }

    const guardResponse: GuardResponse = {
      risk: Math.round(risk * 100) / 100,
      blocked,
      reason,
      categories,
      timestamp: new Date().toISOString(),
      processingTime: Date.now() - startTime,
    };

    // Record security event in metrics
    recordSecurityEvent('prompt_injection_analysis', guardResponse.blocked, guardResponse.risk);

    // Adicionar categoria específica se detectada
    if (injectionResult.category) {
      recordSecurityEvent(injectionResult.category, guardResponse.blocked, guardResponse.risk);
    }

    // Store security result for WORM logging
    (res as any).securityResult = {
      ...guardResponse,
      injectionAnalysis: {
        category: injectionResult.category,
        riskLevel: injectionResult.riskLevel,
        detectedPatterns: injectionResult.detectedPatterns,
        confidence: injectionResult.confidence,
      },
      complianceMetadata: (req as any).complianceMetadata,
    };

    // Log the analysis result
    logger.info('Guard analysis completed', {
      requestId: (req as any).requestId,
      risk: guardResponse.risk,
      blocked: guardResponse.blocked,
      processingTime: guardResponse.processingTime,
      injectionCategory: injectionResult.category,
      riskLevel: injectionResult.riskLevel,
      legalBasis: (req as any).complianceMetadata?.legalBasis,
    });

    res.status(200).json(guardResponse);
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    if (error instanceof z.ZodError) {
      logger.warn('Invalid guard request', {
        errors: error.errors,
        processingTime,
      });
      
      return res.status(400).json({
        error: 'Invalid request format',
        details: error.errors,
        timestamp: new Date().toISOString(),
      });
    }

    logger.error('Guard request failed:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
      processingTime,
    });
  }
});

/**
 * GET /v1/guard/test-injection
 * Testa o sistema contra payloads conhecidos de prompt injection
 */
router.get('/test-injection', rbacMiddleware.requirePermission(Permission.GUARD_READ), async (req: Request, res: Response) => {
  try {
    logger.info('Prompt injection test requested', {
      requestId: (req as any).requestId,
      ip: req.ip,
    });

    const testResults = await promptInjectionGuard.testAgainstPayloads();

    logger.info('Prompt injection test completed', {
      requestId: (req as any).requestId,
      detectionRate: testResults.detectionRate,
      falsePositiveRate: testResults.falsePositiveRate,
    });

    res.json({
      ...testResults,
      timestamp: new Date().toISOString(),
      compliance: {
        target_detection_rate: 90,
        target_false_positive_rate: 5,
        meets_detection_target: testResults.detectionRate >= 90,
        meets_false_positive_target: testResults.falsePositiveRate <= 5,
        overall_compliance: testResults.detectionRate >= 90 && testResults.falsePositiveRate <= 5,
      },
    });

  } catch (error) {
    logger.error('Prompt injection test failed:', error);

    res.status(500).json({
      error: 'Failed to run prompt injection test',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Send high-risk alert email
 */
async function sendHighRiskAlert(req: any, riskAssessment: any, analysisResult: any): Promise<void> {
  try {
    const context: AlertContext = {
      type: 'high_risk',
      severity: 'high',
      title: 'High-Risk Content Detected',
      description: `Content with risk score ${riskAssessment.score}/100 was detected and ${riskAssessment.shouldBlock ? 'blocked' : 'allowed'}.`,
      requestId: req.requestId,
      tenantId: req.auth?.tenantId,
      riskAssessment,
      metadata: {
        content: req.body.content?.substring(0, 200) + '...', // First 200 chars only
        stage: req.body.stage,
        mode: req.body.mode,
        injectionConfidence: analysisResult.confidence,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      },
      runbookUrl: 'https://docs.guardagent.io/runbooks/high-risk-content',
      timestamp: new Date(),
    };

    await mailService.sendHighRiskAlert(context);
  } catch (error) {
    logger.error('Failed to send high-risk alert:', error);
    // Don't throw - alert failure shouldn't fail the request
  }
}

export { router as guardRouter };

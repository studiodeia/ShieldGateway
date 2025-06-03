import { Request, Response, NextFunction } from 'express';
import pino from 'pino';
import { RiskEngine, AnalysisContext, RiskAssessment } from '../services/RiskEngine';
import { recordSecurityEvent } from './metrics';

const logger = pino({
  name: 'core:risk-gate',
  level: process.env.LOG_LEVEL || 'info',
});

declare global {
  namespace Express {
    interface Request {
      riskAssessment?: RiskAssessment;
    }
  }
}

export interface RiskGateOptions {
  enableBlocking?: boolean;
  customThreshold?: number;
  skipPaths?: string[];
  dryRun?: boolean;
}

export class RiskGateMiddleware {
  private riskEngine: RiskEngine;
  private options: RiskGateOptions;

  constructor(options: RiskGateOptions = {}) {
    this.riskEngine = RiskEngine.getInstance();
    this.options = {
      enableBlocking: true,
      skipPaths: ['/v1/health', '/metrics', '/docs'],
      dryRun: false,
      ...options,
    };
  }

  /**
   * Main risk gate middleware
   */
  middleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip risk assessment for certain paths
      if (this.shouldSkipPath(req.path)) {
        return next();
      }

      // Extract risk context from request
      const context = this.extractRiskContext(req);
      
      // Calculate risk assessment
      const assessment = this.riskEngine.calculateRisk(context);
      
      // Attach assessment to request for downstream use
      req.riskAssessment = assessment;
      
      // Add risk headers to response
      this.addRiskHeaders(res, assessment);
      
      // Record security event
      recordSecurityEvent(
        assessment.bucket,
        assessment.shouldBlock ? 'blocked' : 'allowed',
        req.auth?.tenantId
      );

      // Check if request should be blocked
      if (this.shouldBlockRequest(assessment, req)) {
        return this.blockRequest(req, res, assessment);
      }

      // Log risk assessment
      this.logRiskAssessment(req, assessment);
      
      next();
    } catch (error) {
      logger.error('Risk gate middleware error:', error);
      
      // In case of error, allow request to proceed but log the issue
      recordSecurityEvent('unknown', 'error', req.auth?.tenantId);
      next();
    }
  };

  /**
   * Extract risk context from request
   */
  private extractRiskContext(req: Request): AnalysisContext {
    // Extract injection confidence from guard result if available
    const injectionConfidence = this.extractInjectionConfidence(req);
    
    // Extract data sensitivity based on request content
    const dataSensitivityIndex = this.extractDataSensitivity(req);
    
    // Extract origin trust level
    const originTrustLevel = this.extractOriginTrust(req);
    
    // Get tenant risk profile (mockado para Sprint 3)
    const tenantRiskProfile = this.getTenantRiskProfile(req.auth?.tenantId);

    return {
      requestId: req.requestId,
      tenantId: req.auth?.tenantId,
      injectionConfidence,
      dataSensitivityIndex,
      originTrustLevel,
      tenantRiskProfile,
      metadata: {
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
      },
    };
  }

  /**
   * Extract injection confidence from request
   */
  private extractInjectionConfidence(req: Request): number {
    // Check if guard middleware has already analyzed the request
    const guardResult = (req as any).guardResult;
    if (guardResult?.confidence !== undefined) {
      return guardResult.confidence;
    }

    // Basic heuristic analysis for requests not yet processed by guard
    const content = this.getRequestContent(req);
    if (!content) return 0;

    // Simple injection patterns (this would be enhanced with actual ML model)
    const injectionPatterns = [
      /ignore\s+previous\s+instructions/i,
      /system\s*:\s*you\s+are/i,
      /\[INST\]/i,
      /<\|im_start\|>/i,
      /forget\s+everything/i,
      /new\s+instructions/i,
    ];

    let confidence = 0;
    for (const pattern of injectionPatterns) {
      if (pattern.test(content)) {
        confidence = Math.max(confidence, 0.7);
      }
    }

    // Length-based heuristic
    if (content.length > 5000) {
      confidence = Math.max(confidence, 0.3);
    }

    return Math.min(1, confidence);
  }

  /**
   * Extract data sensitivity index
   */
  private extractDataSensitivity(req: Request): number {
    const content = this.getRequestContent(req);
    if (!content) return 0;

    // Patterns for sensitive data (LGPD/GDPR categories)
    const sensitivePatterns = [
      { pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/, weight: 0.9 }, // CPF
      { pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/, weight: 0.8 }, // CNPJ
      { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, weight: 0.6 }, // Email
      { pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, weight: 0.8 }, // Credit card
      { pattern: /\b\d{11}\b/, weight: 0.7 }, // Phone number
      { pattern: /\b\d{5}-?\d{3}\b/, weight: 0.4 }, // CEP
    ];

    let maxSensitivity = 0;
    for (const { pattern, weight } of sensitivePatterns) {
      if (pattern.test(content)) {
        maxSensitivity = Math.max(maxSensitivity, weight);
      }
    }

    // Check for sensitive keywords
    const sensitiveKeywords = [
      'password', 'senha', 'token', 'secret', 'chave',
      'medical', 'health', 'saúde', 'médico',
      'financial', 'financeiro', 'bank', 'banco',
      'personal', 'pessoal', 'private', 'privado'
    ];

    for (const keyword of sensitiveKeywords) {
      if (content.toLowerCase().includes(keyword)) {
        maxSensitivity = Math.max(maxSensitivity, 0.5);
      }
    }

    return maxSensitivity;
  }

  /**
   * Extract origin trust level
   */
  private extractOriginTrust(req: Request): number {
    let trustLevel = 0.5; // Default neutral trust

    // IP-based trust (simplified)
    const ip = req.ip;
    if (ip) {
      // Private/internal IPs get higher trust
      if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.')) {
        trustLevel = Math.max(trustLevel, 0.8);
      }
      
      // Known good IP ranges (would be configurable)
      // This is a placeholder - in production, this would check against
      // IP reputation services, allowlists, etc.
    }

    // User-Agent based trust
    const userAgent = req.get('User-Agent');
    if (userAgent) {
      // Legitimate client patterns
      if (userAgent.includes('GuardAgent-SDK') || userAgent.includes('PostmanRuntime')) {
        trustLevel = Math.max(trustLevel, 0.7);
      }
      
      // Suspicious patterns
      if (userAgent.includes('curl') || userAgent.includes('wget') || userAgent.length < 10) {
        trustLevel = Math.min(trustLevel, 0.3);
      }
    }

    // Authentication status
    if (req.auth?.tenantId) {
      trustLevel = Math.max(trustLevel, 0.6); // Authenticated requests get some trust
    }

    return Math.max(0, Math.min(1, trustLevel));
  }

  /**
   * Get tenant risk profile (mockado para Sprint 3)
   */
  private getTenantRiskProfile(tenantId?: string): number {
    if (!tenantId) return 0.5;

    // TODO Sprint 4/5: Implement real tenant risk profiling
    // This would be based on:
    // - Historical risk scores
    // - Number of blocked requests
    // - Security incidents
    // - Manual risk adjustments
    
    // For now, return a mock value based on tenant ID hash
    const hash = tenantId.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return 0.3 + (Math.abs(hash) % 40) / 100; // Range: 0.3 - 0.7
  }

  /**
   * Get request content for analysis
   */
  private getRequestContent(req: Request): string {
    let content = '';
    
    // Get content from body
    if (req.body) {
      if (typeof req.body === 'string') {
        content += req.body;
      } else if (typeof req.body === 'object') {
        content += JSON.stringify(req.body);
      }
    }
    
    // Get content from query parameters
    if (req.query && Object.keys(req.query).length > 0) {
      content += ' ' + JSON.stringify(req.query);
    }
    
    return content;
  }

  /**
   * Check if path should be skipped
   */
  private shouldSkipPath(path: string): boolean {
    return this.options.skipPaths?.some(skipPath => path.startsWith(skipPath)) || false;
  }

  /**
   * Check if request should be blocked
   */
  private shouldBlockRequest(assessment: RiskAssessment, req: Request): boolean {
    if (!this.options.enableBlocking || this.options.dryRun) {
      return false;
    }

    // Use custom threshold if provided, otherwise use assessment's shouldBlock
    if (this.options.customThreshold !== undefined) {
      return assessment.score >= this.options.customThreshold;
    }

    return assessment.shouldBlock;
  }

  /**
   * Block request with appropriate response
   */
  private blockRequest(req: Request, res: Response, assessment: RiskAssessment): void {
    logger.warn('Request blocked by risk gate', {
      requestId: req.requestId,
      tenantId: req.auth?.tenantId,
      riskScore: assessment.score,
      bucket: assessment.bucket,
      factors: assessment.factors,
    });

    res.status(429).json({
      error: 'Request blocked due to high risk score',
      code: 'RISK_THRESHOLD_EXCEEDED',
      riskScore: assessment.score,
      riskBucket: assessment.bucket,
      timestamp: assessment.timestamp.toISOString(),
      requestId: req.requestId,
      retryAfter: 300, // 5 minutes
    });
  }

  /**
   * Add risk headers to response
   */
  private addRiskHeaders(res: Response, assessment: RiskAssessment): void {
    res.setHeader('X-Risk-Score', assessment.score.toString());
    res.setHeader('X-Risk-Bucket', assessment.bucket);
    res.setHeader('X-Risk-Config-Version', assessment.configVersion);
    
    if (assessment.shouldBlock) {
      res.setHeader('X-Risk-Action', 'blocked');
    }
  }

  /**
   * Log risk assessment
   */
  private logRiskAssessment(req: Request, assessment: RiskAssessment): void {
    logger.debug('Risk assessment completed', {
      requestId: req.requestId,
      tenantId: req.auth?.tenantId,
      method: req.method,
      path: req.path,
      riskScore: assessment.score,
      riskBucket: assessment.bucket,
      shouldBlock: assessment.shouldBlock,
      factors: assessment.factors,
      weights: assessment.weights,
      configVersion: assessment.configVersion,
    });
  }
}

// Export singleton instance
export const riskGate = new RiskGateMiddleware();

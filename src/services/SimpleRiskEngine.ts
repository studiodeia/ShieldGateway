import pino from 'pino';

const logger = pino({
  name: 'gateway:simple-risk-engine',
  level: process.env.LOG_LEVEL || 'info',
});

export type RiskAction = 'ALLOW' | 'BLOCK' | 'REVIEW';

export interface SimpleRiskContext {
  requestId: string;
  content: string;
  injectionConfidence: number; // 0-1
  piiDetected: boolean;
  piiTypes: string[];
  userTier: string;
}

export interface SimpleRiskAssessment {
  action: RiskAction;
  score: number; // 0-1 for simplicity
  confidence: number; // 0-1
  reasons: string[];
  factors: {
    injection: number;
    pii: number;
    content: number;
  };
  timestamp: Date;
}

export class SimpleRiskEngine {
  private static instance: SimpleRiskEngine;

  private constructor() {}

  static getInstance(): SimpleRiskEngine {
    if (!SimpleRiskEngine.instance) {
      SimpleRiskEngine.instance = new SimpleRiskEngine();
    }
    return SimpleRiskEngine.instance;
  }

  /**
   * Calculate simple risk assessment
   */
  assess(context: SimpleRiskContext): SimpleRiskAssessment {
    const factors = this.calculateFactors(context);
    const score = this.calculateScore(factors);
    const action = this.determineAction(score, context.userTier);
    const reasons = this.generateReasons(factors, context);

    const assessment: SimpleRiskAssessment = {
      action,
      score,
      confidence: this.calculateConfidence(factors),
      reasons,
      factors,
      timestamp: new Date(),
    };

    logger.debug('Simple risk assessment completed', {
      requestId: context.requestId,
      action,
      score: score.toFixed(3),
      userTier: context.userTier,
    });

    return assessment;
  }

  /**
   * Calculate risk factors
   */
  private calculateFactors(context: SimpleRiskContext): {
    injection: number;
    pii: number;
    content: number;
  } {
    // Injection factor (0-1)
    const injection = Math.max(0, Math.min(1, context.injectionConfidence));

    // PII factor (0-1)
    let pii = 0;
    if (context.piiDetected) {
      // Base PII risk
      pii = 0.3;
      
      // Increase based on PII types
      const sensitiveTypes = ['cpf', 'cnpj', 'credit_card', 'ssn'];
      const hasSensitive = context.piiTypes.some(type => 
        sensitiveTypes.includes(type.toLowerCase())
      );
      
      if (hasSensitive) {
        pii = 0.7;
      }
      
      // Multiple PII types increase risk
      if (context.piiTypes.length > 2) {
        pii = Math.min(1, pii + 0.2);
      }
    }

    // Content factor (0-1) - based on content characteristics
    let content = 0;
    const contentLength = context.content.length;
    
    // Very long content might be suspicious
    if (contentLength > 5000) {
      content += 0.2;
    }
    
    // Check for suspicious patterns
    const suspiciousPatterns = [
      /system\s*:/i,
      /assistant\s*:/i,
      /ignore\s+previous/i,
      /forget\s+everything/i,
      /new\s+instructions/i,
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(context.content)) {
        content += 0.15;
      }
    }
    
    content = Math.min(1, content);

    return { injection, pii, content };
  }

  /**
   * Calculate overall risk score (0-1)
   */
  private calculateScore(factors: { injection: number; pii: number; content: number }): number {
    // Weighted average with injection being most important
    const weights = {
      injection: 0.6,
      pii: 0.3,
      content: 0.1,
    };

    const score = 
      factors.injection * weights.injection +
      factors.pii * weights.pii +
      factors.content * weights.content;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Determine action based on score and tier
   */
  private determineAction(score: number, userTier: string): RiskAction {
    // Tier-based thresholds
    const thresholds = {
      free: {
        block: 0.7,   // More conservative for free tier
        review: 0.4,
      },
      starter: {
        block: 0.8,
        review: 0.5,
      },
      pro: {
        block: 0.85,  // More permissive for paying customers
        review: 0.6,
      },
    };

    const tierThresholds = thresholds[userTier as keyof typeof thresholds] || thresholds.free;

    if (score >= tierThresholds.block) {
      return 'BLOCK';
    } else if (score >= tierThresholds.review) {
      return 'REVIEW';
    } else {
      return 'ALLOW';
    }
  }

  /**
   * Calculate confidence in the assessment
   */
  private calculateConfidence(factors: { injection: number; pii: number; content: number }): number {
    // Higher confidence when factors are more extreme (close to 0 or 1)
    const extremeness = Object.values(factors).map(factor => {
      return Math.max(factor, 1 - factor); // Distance from 0.5
    });

    const avgExtremeness = extremeness.reduce((sum, val) => sum + val, 0) / extremeness.length;
    
    // Convert to confidence (0.5 = low confidence, 1.0 = high confidence)
    return Math.max(0.5, avgExtremeness);
  }

  /**
   * Generate human-readable reasons
   */
  private generateReasons(
    factors: { injection: number; pii: number; content: number },
    context: SimpleRiskContext
  ): string[] {
    const reasons: string[] = [];

    // Injection reasons
    if (factors.injection > 0.7) {
      reasons.push('High probability of prompt injection detected');
    } else if (factors.injection > 0.4) {
      reasons.push('Potential prompt injection patterns found');
    }

    // PII reasons
    if (factors.pii > 0.6) {
      reasons.push(`Sensitive personal data detected: ${context.piiTypes.join(', ')}`);
    } else if (factors.pii > 0.2) {
      reasons.push(`Personal data found: ${context.piiTypes.join(', ')}`);
    }

    // Content reasons
    if (factors.content > 0.3) {
      reasons.push('Suspicious content patterns detected');
    }

    // Default reason if no specific issues
    if (reasons.length === 0) {
      reasons.push('Content appears safe');
    }

    return reasons;
  }

  /**
   * Get risk level as string for display
   */
  getRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (score < 0.3) return 'LOW';
    if (score < 0.7) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Get risk color for UI
   */
  getRiskColor(score: number): string {
    if (score < 0.3) return '#16a34a'; // green
    if (score < 0.7) return '#ea580c'; // orange
    return '#dc2626'; // red
  }

  /**
   * Format score for display (percentage)
   */
  formatScore(score: number): string {
    return `${Math.round(score * 100)}%`;
  }

  /**
   * Check if webhook should be triggered
   */
  shouldTriggerWebhook(assessment: SimpleRiskAssessment): boolean {
    // Trigger webhook for BLOCK or high-confidence REVIEW
    return assessment.action === 'BLOCK' || 
           (assessment.action === 'REVIEW' && assessment.confidence > 0.8);
  }

  /**
   * Generate webhook payload
   */
  generateWebhookPayload(
    context: SimpleRiskContext,
    assessment: SimpleRiskAssessment
  ): object {
    return {
      event: 'risk_assessment',
      timestamp: assessment.timestamp.toISOString(),
      request_id: context.requestId,
      risk: {
        action: assessment.action,
        score: assessment.score,
        level: this.getRiskLevel(assessment.score),
        confidence: assessment.confidence,
        reasons: assessment.reasons,
      },
      content: {
        length: context.content.length,
        preview: context.content.substring(0, 100) + '...', // First 100 chars
        pii_detected: context.piiDetected,
        pii_types: context.piiTypes,
      },
      user: {
        tier: context.userTier,
      },
    };
  }
}

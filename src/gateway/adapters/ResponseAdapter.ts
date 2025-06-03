import { RiskAssessment } from '../../services/RiskEngine';
import { TierConfig } from '../../config/tiers';
import pino from 'pino';

const logger = pino({
  name: 'gateway:response-adapter',
  level: process.env.LOG_LEVEL || 'info',
});

export type GatewayAction = 'ALLOW' | 'BLOCK' | 'REVIEW';

export interface GatewayResponse {
  requestId: string;
  action: GatewayAction;
  score: number; // 0-1 simplified
  confidence: number; // 0-1
  reasons: string[];
  timestamp: string;
  tier: string;
  // Optional detailed info for higher tiers
  details?: {
    factors?: Record<string, number>;
    originalScore?: number; // 0-100 from Core
    bucket?: string;
    piiDetected?: boolean;
    piiTypes?: string[];
  };
}

export interface AnalysisResult {
  blocked: boolean;
  confidence: number;
  reason: string;
  piiDetected?: boolean;
  piiTypes?: string[];
}

export class ResponseAdapter {
  private static instance: ResponseAdapter;

  private constructor() {}

  static getInstance(): ResponseAdapter {
    if (!ResponseAdapter.instance) {
      ResponseAdapter.instance = new ResponseAdapter();
    }
    return ResponseAdapter.instance;
  }

  /**
   * Adapt Core v0.3.1 complex response to Gateway simple format
   */
  adaptResponse(
    requestId: string,
    riskAssessment: RiskAssessment,
    analysisResult: AnalysisResult,
    tierConfig: TierConfig
  ): GatewayResponse {
    const action = this.determineAction(riskAssessment, analysisResult, tierConfig.name);
    const simplifiedScore = this.simplifyScore(riskAssessment.score);
    const reasons = this.generateUserFriendlyReasons(riskAssessment, analysisResult);

    const response: GatewayResponse = {
      requestId,
      action,
      score: simplifiedScore,
      confidence: Math.min(1, riskAssessment.confidence || analysisResult.confidence),
      reasons,
      timestamp: new Date().toISOString(),
      tier: tierConfig.name,
    };

    // Add detailed info for higher tiers
    if (this.shouldIncludeDetails(tierConfig.name)) {
      response.details = {
        factors: riskAssessment.factors,
        originalScore: riskAssessment.score,
        bucket: riskAssessment.bucket,
        piiDetected: analysisResult.piiDetected,
        piiTypes: analysisResult.piiTypes,
      };
    }

    logger.debug('Response adapted for Gateway', {
      requestId,
      originalScore: riskAssessment.score,
      simplifiedScore,
      action,
      tier: tierConfig.name,
    });

    return response;
  }

  /**
   * Determine action based on Core assessment and tier
   */
  private determineAction(
    riskAssessment: RiskAssessment,
    analysisResult: AnalysisResult,
    tier: string
  ): GatewayAction {
    // Use Core's shouldBlock as primary indicator
    if (riskAssessment.shouldBlock || analysisResult.blocked) {
      return 'BLOCK';
    }

    // Tier-specific thresholds for REVIEW
    const reviewThresholds = {
      free: 0.3,    // More conservative for free tier
      starter: 0.4,
      pro: 0.5,     // More permissive for paying customers
    };

    const threshold = reviewThresholds[tier as keyof typeof reviewThresholds] || 0.3;
    const normalizedScore = riskAssessment.score / 100;

    if (normalizedScore >= threshold) {
      return 'REVIEW';
    }

    return 'ALLOW';
  }

  /**
   * Convert 0-100 score to 0-1 simplified score
   */
  private simplifyScore(originalScore: number): number {
    // Convert 0-100 to 0-1 with some smoothing
    const normalized = originalScore / 100;
    
    // Apply tier-appropriate smoothing
    if (normalized < 0.1) return 0;
    if (normalized > 0.9) return 1;
    
    // Round to 2 decimal places for clean display
    return Math.round(normalized * 100) / 100;
  }

  /**
   * Generate user-friendly reasons from Core assessment
   */
  private generateUserFriendlyReasons(
    riskAssessment: RiskAssessment,
    analysisResult: AnalysisResult
  ): string[] {
    const reasons: string[] = [];

    // Primary reason from analysis
    if (analysisResult.reason) {
      reasons.push(this.humanizeReason(analysisResult.reason));
    }

    // PII detection
    if (analysisResult.piiDetected && analysisResult.piiTypes?.length) {
      reasons.push(`Personal data detected: ${analysisResult.piiTypes.join(', ')}`);
    }

    // Risk factors (simplified)
    if (riskAssessment.factors) {
      const highFactors = Object.entries(riskAssessment.factors)
        .filter(([_, value]) => value > 0.5)
        .map(([key, _]) => this.humanizeFactorName(key));
      
      if (highFactors.length > 0) {
        reasons.push(`Risk factors: ${highFactors.join(', ')}`);
      }
    }

    // Default reason if none provided
    if (reasons.length === 0) {
      const score = riskAssessment.score / 100;
      if (score < 0.3) {
        reasons.push('Content appears safe');
      } else if (score < 0.7) {
        reasons.push('Moderate risk detected');
      } else {
        reasons.push('High risk content detected');
      }
    }

    return reasons;
  }

  /**
   * Convert technical reasons to user-friendly messages
   */
  private humanizeReason(reason: string): string {
    const reasonMap: Record<string, string> = {
      'prompt_injection_detected': 'Potential prompt injection attempt detected',
      'high_injection_confidence': 'High probability of prompt injection',
      'pii_detected': 'Personal information found in content',
      'suspicious_patterns': 'Suspicious content patterns detected',
      'blocked_by_policy': 'Content blocked by security policy',
      'rate_limit_exceeded': 'Request rate limit exceeded',
    };

    return reasonMap[reason] || reason;
  }

  /**
   * Convert technical factor names to user-friendly names
   */
  private humanizeFactorName(factorName: string): string {
    const factorMap: Record<string, string> = {
      'inj_prompt': 'prompt injection',
      'data_category': 'sensitive data',
      'origin': 'request origin',
      'tenant_reputation': 'account reputation',
    };

    return factorMap[factorName] || factorName;
  }

  /**
   * Determine if detailed info should be included based on tier
   */
  private shouldIncludeDetails(tier: string): boolean {
    return ['starter', 'pro'].includes(tier);
  }

  /**
   * Generate headers for HTTP response
   */
  generateHeaders(response: GatewayResponse): Record<string, string> {
    const headers: Record<string, string> = {
      'X-GuardAgent-Action': response.action,
      'X-GuardAgent-Score': response.score.toString(),
      'X-GuardAgent-Confidence': response.confidence.toString(),
      'X-GuardAgent-Tier': response.tier,
    };

    // Add detailed headers for higher tiers
    if (response.details) {
      headers['X-GuardAgent-Original-Score'] = response.details.originalScore?.toString() || '0';
      headers['X-GuardAgent-Bucket'] = response.details.bucket || 'unknown';
      
      if (response.details.piiDetected) {
        headers['X-GuardAgent-PII-Detected'] = 'true';
        headers['X-GuardAgent-PII-Types'] = response.details.piiTypes?.join(',') || '';
      }
    }

    return headers;
  }

  /**
   * Generate webhook payload for external integrations
   */
  generateWebhookPayload(
    response: GatewayResponse,
    originalContent: string,
    endpoint: string
  ): object {
    return {
      event: 'content_analyzed',
      timestamp: response.timestamp,
      request_id: response.requestId,
      action: response.action,
      risk: {
        score: response.score,
        confidence: response.confidence,
        level: this.getRiskLevel(response.score),
      },
      content: {
        length: originalContent.length,
        preview: originalContent.substring(0, 100) + (originalContent.length > 100 ? '...' : ''),
        endpoint,
      },
      reasons: response.reasons,
      tier: response.tier,
      details: response.details,
    };
  }

  /**
   * Get risk level string for display
   */
  private getRiskLevel(score: number): string {
    if (score < 0.3) return 'LOW';
    if (score < 0.7) return 'MEDIUM';
    return 'HIGH';
  }

  /**
   * Format response for different output formats
   */
  formatForOutput(response: GatewayResponse, format: 'json' | 'simple' | 'detailed'): any {
    switch (format) {
      case 'simple':
        return {
          action: response.action,
          score: response.score,
          safe: response.action === 'ALLOW',
        };

      case 'detailed':
        return response;

      case 'json':
      default:
        return {
          requestId: response.requestId,
          action: response.action,
          score: response.score,
          confidence: response.confidence,
          reasons: response.reasons,
          timestamp: response.timestamp,
          ...(response.details && { details: response.details }),
        };
    }
  }
}

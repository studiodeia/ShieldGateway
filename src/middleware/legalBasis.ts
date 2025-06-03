import { Request, Response, NextFunction } from 'express';
import { 
  LegalBasis, 
  ComplianceMetadata, 
  DEFAULT_LEGAL_BASIS_CONFIGS,
  ProcessingPurpose,
  DataCategory,
  SecurityMeasure 
} from '../types/compliance';
import pino from 'pino';

const logger = pino({
  name: 'core:legal-basis',
  level: process.env.LOG_LEVEL || 'info',
});

declare global {
  namespace Express {
    interface Request {
      complianceMetadata: ComplianceMetadata;
    }
  }
}

/**
 * Determina a base legal baseada no contexto da requisição
 */
function determineLegalBasis(req: Request): LegalBasis {
  const path = req.path;
  const userAgent = req.get('User-Agent') || '';
  const contentType = req.get('Content-Type') || '';
  
  // Análise baseada no endpoint
  if (path.includes('/guard')) {
    // Requisições de análise de segurança
    return LegalBasis.LEGITIMATE_INTEREST;
  }
  
  if (path.includes('/health') || path.includes('/metrics')) {
    // Monitoramento operacional
    return LegalBasis.LEGAL_OBLIGATION;
  }
  
  if (path.includes('/dsr/')) {
    // Direitos dos titulares
    return LegalBasis.LEGAL_OBLIGATION;
  }
  
  if (path.includes('/dpia/')) {
    // DPIA e conformidade
    return LegalBasis.LEGAL_OBLIGATION;
  }
  
  // Default: interesse legítimo para assistência de IA
  return LegalBasis.LEGITIMATE_INTEREST;
}

/**
 * Determina as finalidades do tratamento
 */
function determinePurposes(req: Request, legalBasis: LegalBasis): ProcessingPurpose[] {
  const path = req.path;
  const purposes: ProcessingPurpose[] = [];
  
  if (path.includes('/guard')) {
    purposes.push(ProcessingPurpose.AI_SECURITY);
    purposes.push(ProcessingPurpose.CONTENT_MODERATION);
    
    // Verificar se é análise de fraude baseada no conteúdo
    if (req.body?.stage === 'input' && req.body?.policy === 'highSecurity') {
      purposes.push(ProcessingPurpose.FRAUD_PREVENTION);
    }
  }
  
  if (path.includes('/health') || path.includes('/metrics')) {
    purposes.push(ProcessingPurpose.PERFORMANCE_ANALYTICS);
    purposes.push(ProcessingPurpose.COMPLIANCE_MONITORING);
  }
  
  if (path.includes('/dsr/')) {
    purposes.push(ProcessingPurpose.LEGAL_DEFENSE);
  }
  
  if (path.includes('/dpia/')) {
    purposes.push(ProcessingPurpose.COMPLIANCE_MONITORING);
    purposes.push(ProcessingPurpose.AUDIT_TRAIL);
  }
  
  // Sempre incluir auditoria para conformidade
  if (!purposes.includes(ProcessingPurpose.AUDIT_TRAIL)) {
    purposes.push(ProcessingPurpose.AUDIT_TRAIL);
  }
  
  return purposes;
}

/**
 * Determina as categorias de dados processados
 */
function determineDataCategories(req: Request): DataCategory[] {
  const categories: DataCategory[] = [];
  
  // Sempre processamos dados técnicos
  categories.push(DataCategory.TECHNICAL);
  
  // Se há conteúdo no body, processamos conteúdo do usuário
  if (req.body?.content) {
    categories.push(DataCategory.CONTENT);
  }
  
  // Se há metadados de usuário
  if (req.body?.metadata?.userId || req.headers['x-user-id']) {
    categories.push(DataCategory.IDENTIFICATION);
  }
  
  // Dados comportamentais para análise de padrões
  if (req.path.includes('/guard')) {
    categories.push(DataCategory.BEHAVIORAL);
  }
  
  // Dados de contato se fornecidos
  if (req.body?.email || req.headers['x-user-email']) {
    categories.push(DataCategory.CONTACT);
  }
  
  return categories;
}

/**
 * Determina o período de retenção baseado na finalidade
 */
function determineRetentionPeriod(purposes: ProcessingPurpose[]): number {
  let maxRetention = 365; // Default: 1 ano
  
  for (const purpose of purposes) {
    switch (purpose) {
      case ProcessingPurpose.COMPLIANCE_MONITORING:
      case ProcessingPurpose.AUDIT_TRAIL:
      case ProcessingPurpose.LEGAL_DEFENSE:
        maxRetention = Math.max(maxRetention, 2555); // 7 anos
        break;
      case ProcessingPurpose.FRAUD_PREVENTION:
      case ProcessingPurpose.SECURITY_INCIDENT:
        maxRetention = Math.max(maxRetention, 1095); // 3 anos
        break;
      case ProcessingPurpose.AI_SECURITY:
      case ProcessingPurpose.CONTENT_MODERATION:
        maxRetention = Math.max(maxRetention, 730); // 2 anos
        break;
      default:
        maxRetention = Math.max(maxRetention, 365); // 1 ano
    }
  }
  
  return maxRetention;
}

/**
 * Middleware para injetar metadados de conformidade legal
 */
export function legalBasisMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const startTime = Date.now();
    
    // Determinar base legal
    const legalBasis = determineLegalBasis(req);
    
    // Determinar finalidades
    const purposes = determinePurposes(req, legalBasis);
    
    // Determinar categorias de dados
    const dataCategories = determineDataCategories(req);
    
    // Determinar período de retenção
    const retentionPeriod = determineRetentionPeriod(purposes);
    
    // Medidas de segurança padrão
    const securityMeasures: SecurityMeasure[] = [
      SecurityMeasure.ENCRYPTION_AT_REST,
      SecurityMeasure.ENCRYPTION_IN_TRANSIT,
      SecurityMeasure.ACCESS_CONTROL,
      SecurityMeasure.AUDIT_LOGGING,
      SecurityMeasure.WORM_LOGGING,
      SecurityMeasure.HASH_CHAIN,
      SecurityMeasure.OBJECT_LOCK,
      SecurityMeasure.DATA_MINIMIZATION,
      SecurityMeasure.RETENTION_POLICY,
    ];
    
    // Criar metadados de conformidade
    const complianceMetadata: ComplianceMetadata = {
      legalBasis,
      purposes,
      dataCategories,
      securityMeasures,
      retentionPeriod,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      dataSubjectId: req.headers['x-user-id'] as string,
      consentId: req.headers['x-consent-id'] as string,
      dpiaReference: process.env.DPIA_REFERENCE || 'DPIA-GUARDAGENT-2024-001',
    };
    
    // Anexar aos metadados da requisição
    req.complianceMetadata = complianceMetadata;
    
    // Adicionar header de base legal para transparência
    res.setHeader('X-Legal-Basis', legalBasis);
    res.setHeader('X-Processing-Purposes', purposes.join(','));
    res.setHeader('X-Retention-Period', retentionPeriod.toString());
    res.setHeader('X-DPIA-Reference', complianceMetadata.dpiaReference || '');
    
    const processingTime = Date.now() - startTime;
    
    logger.debug('Legal basis determined', {
      requestId: req.requestId,
      legalBasis,
      purposes,
      dataCategories,
      retentionPeriod,
      processingTime,
    });
    
    next();
    
  } catch (error) {
    logger.error('Legal basis middleware error:', error);
    
    // Em caso de erro, usar configuração padrão segura
    req.complianceMetadata = {
      legalBasis: LegalBasis.LEGITIMATE_INTEREST,
      purposes: [ProcessingPurpose.AI_SECURITY, ProcessingPurpose.AUDIT_TRAIL],
      dataCategories: [DataCategory.TECHNICAL],
      securityMeasures: [SecurityMeasure.ENCRYPTION_AT_REST, SecurityMeasure.AUDIT_LOGGING],
      retentionPeriod: 365,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      dpiaReference: 'DPIA-GUARDAGENT-2024-001',
    };
    
    res.setHeader('X-Legal-Basis', LegalBasis.LEGITIMATE_INTEREST);
    
    next();
  }
}

/**
 * Função utilitária para obter configuração de base legal por contexto
 */
export function getLegalBasisConfig(context: string): Partial<ComplianceMetadata> {
  return DEFAULT_LEGAL_BASIS_CONFIGS[context] || DEFAULT_LEGAL_BASIS_CONFIGS.ai_assistance;
}

/**
 * Função para validar se uma base legal é adequada para uma finalidade
 */
export function validateLegalBasisForPurpose(
  legalBasis: LegalBasis, 
  purpose: ProcessingPurpose
): boolean {
  // Mapeamento de finalidades que requerem bases legais específicas
  const restrictedPurposes: Record<ProcessingPurpose, LegalBasis[]> = {
    [ProcessingPurpose.COMPLIANCE_MONITORING]: [
      LegalBasis.LEGAL_OBLIGATION,
      LegalBasis.LEGITIMATE_INTEREST,
    ],
    [ProcessingPurpose.AUDIT_TRAIL]: [
      LegalBasis.LEGAL_OBLIGATION,
      LegalBasis.LEGITIMATE_INTEREST,
    ],
    [ProcessingPurpose.LEGAL_DEFENSE]: [
      LegalBasis.LEGAL_OBLIGATION,
      LegalBasis.LEGITIMATE_INTEREST,
      LegalBasis.JUDICIAL_PROCESS,
    ],
    [ProcessingPurpose.FRAUD_PREVENTION]: [
      LegalBasis.LEGITIMATE_INTEREST,
      LegalBasis.LEGAL_OBLIGATION,
    ],
    [ProcessingPurpose.AI_SECURITY]: [
      LegalBasis.LEGITIMATE_INTEREST,
      LegalBasis.CONSENT,
    ],
    [ProcessingPurpose.CONTENT_MODERATION]: [
      LegalBasis.LEGITIMATE_INTEREST,
      LegalBasis.CONSENT,
    ],
    [ProcessingPurpose.PERFORMANCE_ANALYTICS]: [
      LegalBasis.LEGITIMATE_INTEREST,
      LegalBasis.CONSENT,
    ],
    [ProcessingPurpose.SECURITY_INCIDENT]: [
      LegalBasis.LEGITIMATE_INTEREST,
      LegalBasis.LEGAL_OBLIGATION,
    ],
    [ProcessingPurpose.RESEARCH_DEVELOPMENT]: [
      LegalBasis.CONSENT,
      LegalBasis.LEGITIMATE_INTEREST,
    ],
    [ProcessingPurpose.SERVICE_IMPROVEMENT]: [
      LegalBasis.LEGITIMATE_INTEREST,
      LegalBasis.CONSENT,
    ],
  };
  
  const allowedBases = restrictedPurposes[purpose];
  return !allowedBases || allowedBases.includes(legalBasis);
}

/**
 * Tipos para conformidade LGPD/GDPR
 */

// LGPD Art. 7 / GDPR Art. 6 - Bases legais
export enum LegalBasis {
  // LGPD Art. 7
  CONSENT = 'consent', // I - consentimento
  LEGAL_OBLIGATION = 'legal_obligation', // II - cumprimento de obrigação legal
  PUBLIC_ADMINISTRATION = 'public_administration', // III - execução de políticas públicas
  RESEARCH = 'research', // IV - realização de estudos por órgão de pesquisa
  CONTRACT = 'contract', // V - execução de contrato
  JUDICIAL_PROCESS = 'judicial_process', // VI - exercício regular de direitos
  LIFE_PROTECTION = 'life_protection', // VII - proteção da vida
  HEALTH_PROTECTION = 'health_protection', // VIII - tutela da saúde
  LEGITIMATE_INTEREST = 'legitimate_interest', // IX - interesse legítimo
  CREDIT_PROTECTION = 'credit_protection', // X - proteção do crédito
  
  // GDPR Art. 6 específicos
  VITAL_INTERESTS = 'vital_interests', // GDPR Art. 6(1)(d)
  PUBLIC_TASK = 'public_task', // GDPR Art. 6(1)(e)
}

// Categorias de dados pessoais
export enum DataCategory {
  IDENTIFICATION = 'identification', // Nome, CPF, RG, etc.
  CONTACT = 'contact', // Email, telefone, endereço
  DEMOGRAPHIC = 'demographic', // Idade, gênero, estado civil
  FINANCIAL = 'financial', // Dados bancários, renda
  HEALTH = 'health', // Dados de saúde (sensíveis)
  BIOMETRIC = 'biometric', // Dados biométricos (sensíveis)
  BEHAVIORAL = 'behavioral', // Padrões de comportamento
  LOCATION = 'location', // Dados de localização
  PROFESSIONAL = 'professional', // Dados profissionais
  PREFERENCES = 'preferences', // Preferências e interesses
  TECHNICAL = 'technical', // IP, cookies, logs técnicos
  CONTENT = 'content', // Conteúdo gerado pelo usuário
}

// Finalidades do tratamento
export enum ProcessingPurpose {
  AI_SECURITY = 'ai_security', // Segurança de IA
  CONTENT_MODERATION = 'content_moderation', // Moderação de conteúdo
  FRAUD_PREVENTION = 'fraud_prevention', // Prevenção de fraude
  COMPLIANCE_MONITORING = 'compliance_monitoring', // Monitoramento de conformidade
  AUDIT_TRAIL = 'audit_trail', // Trilha de auditoria
  PERFORMANCE_ANALYTICS = 'performance_analytics', // Análise de performance
  SECURITY_INCIDENT = 'security_incident', // Resposta a incidentes
  LEGAL_DEFENSE = 'legal_defense', // Defesa legal
  RESEARCH_DEVELOPMENT = 'research_development', // Pesquisa e desenvolvimento
  SERVICE_IMPROVEMENT = 'service_improvement', // Melhoria do serviço
}

// Medidas de segurança implementadas
export enum SecurityMeasure {
  ENCRYPTION_AT_REST = 'encryption_at_rest', // Criptografia em repouso
  ENCRYPTION_IN_TRANSIT = 'encryption_in_transit', // Criptografia em trânsito
  ACCESS_CONTROL = 'access_control', // Controle de acesso
  AUDIT_LOGGING = 'audit_logging', // Log de auditoria
  DATA_MINIMIZATION = 'data_minimization', // Minimização de dados
  PSEUDONYMIZATION = 'pseudonymization', // Pseudonimização
  ANONYMIZATION = 'anonymization', // Anonimização
  RETENTION_POLICY = 'retention_policy', // Política de retenção
  INCIDENT_RESPONSE = 'incident_response', // Resposta a incidentes
  STAFF_TRAINING = 'staff_training', // Treinamento de pessoal
  REGULAR_ASSESSMENT = 'regular_assessment', // Avaliação regular
  WORM_LOGGING = 'worm_logging', // Logging imutável
  HASH_CHAIN = 'hash_chain', // Cadeia de hash
  OBJECT_LOCK = 'object_lock', // Object Lock S3
}

// Metadados de conformidade para cada requisição
export interface ComplianceMetadata {
  legalBasis: LegalBasis;
  purposes: ProcessingPurpose[];
  dataCategories: DataCategory[];
  securityMeasures: SecurityMeasure[];
  retentionPeriod: number; // em dias
  dataSubjectId?: string; // ID do titular (se aplicável)
  consentId?: string; // ID do consentimento (se aplicável)
  dpiaReference?: string; // Referência da DPIA
  timestamp: string;
  requestId: string;
}

// Estrutura para DPIA (Data Protection Impact Assessment)
export interface DPIAStub {
  id: string;
  version: string;
  createdAt: string;
  lastUpdated: string;
  
  // Identificação do tratamento
  processing: {
    name: string;
    description: string;
    purposes: ProcessingPurpose[];
    legalBasis: LegalBasis[];
    dataController: {
      name: string;
      contact: string;
      dpoContact?: string;
    };
  };
  
  // Dados pessoais
  personalData: {
    categories: DataCategory[];
    sources: string[];
    recipients: string[];
    retentionPeriod: number;
    crossBorderTransfer: boolean;
    adequacyDecision?: string;
  };
  
  // Avaliação de risco
  riskAssessment: {
    riskLevel: 'low' | 'medium' | 'high';
    identifiedRisks: string[];
    mitigationMeasures: SecurityMeasure[];
    residualRisk: 'low' | 'medium' | 'high';
  };
  
  // Medidas de segurança
  securityMeasures: {
    technical: SecurityMeasure[];
    organizational: string[];
    hashChainReference: string;
  };
  
  // Direitos dos titulares
  dataSubjectRights: {
    accessProcedure: string;
    rectificationProcedure: string;
    erasureProcedure: string;
    portabilityProcedure: string;
    objectionProcedure: string;
    complaintProcedure: string;
  };
}

// Ticket para direitos dos titulares
export interface DataSubjectRightsTicket {
  id: string;
  type: 'access' | 'rectification' | 'erasure' | 'portability' | 'objection' | 'complaint';
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  dataSubjectId: string;
  email: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  slaDeadline: string; // 30 dias LGPD / 1 mês GDPR
  assignedTo?: string;
  resolution?: string;
  documents: string[];
}

// Interface para DPIA Stub
export interface DPIAStub {
  id: string;
  version: string;
  createdAt: string;
  lastUpdated: string;

  processing: {
    name: string;
    description: string;
    purposes: ProcessingPurpose[];
    legalBasis: LegalBasis[];
    dataController: {
      name: string;
      contact: string;
      dpoContact: string;
    };
  };

  personalData: {
    categories: DataCategory[];
    sources: string[];
    recipients: string[];
    retentionPeriod: number;
    crossBorderTransfer: boolean;
    adequacyDecision?: string;
  };

  riskAssessment: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    identifiedRisks: string[];
    mitigationMeasures: SecurityMeasure[];
    residualRisk: 'low' | 'medium' | 'high' | 'critical';
  };

  securityMeasures: {
    technical: SecurityMeasure[];
    organizational: string[];
    hashChainReference: string;
  };

  dataSubjectRights: {
    accessProcedure: string;
    rectificationProcedure: string;
    erasureProcedure: string;
    portabilityProcedure: string;
    objectionProcedure: string;
    complaintProcedure: string;
  };
}

// Configurações padrão de base legal por contexto
export const DEFAULT_LEGAL_BASIS_CONFIGS: Record<string, Partial<ComplianceMetadata>> = {
  ai_assistance: {
    legalBasis: LegalBasis.LEGITIMATE_INTEREST,
    purposes: [ProcessingPurpose.AI_SECURITY, ProcessingPurpose.SERVICE_IMPROVEMENT],
    dataCategories: [DataCategory.CONTENT, DataCategory.TECHNICAL],
    securityMeasures: [
      SecurityMeasure.ENCRYPTION_AT_REST,
      SecurityMeasure.ENCRYPTION_IN_TRANSIT,
      SecurityMeasure.ACCESS_CONTROL,
      SecurityMeasure.AUDIT_LOGGING,
      SecurityMeasure.WORM_LOGGING,
      SecurityMeasure.HASH_CHAIN,
    ],
    retentionPeriod: 365,
  },

  security_analysis: {
    legalBasis: LegalBasis.LEGITIMATE_INTEREST,
    purposes: [ProcessingPurpose.AI_SECURITY, ProcessingPurpose.FRAUD_PREVENTION],
    dataCategories: [DataCategory.CONTENT, DataCategory.TECHNICAL, DataCategory.BEHAVIORAL],
    securityMeasures: [
      SecurityMeasure.ENCRYPTION_AT_REST,
      SecurityMeasure.ENCRYPTION_IN_TRANSIT,
      SecurityMeasure.ACCESS_CONTROL,
      SecurityMeasure.AUDIT_LOGGING,
      SecurityMeasure.WORM_LOGGING,
      SecurityMeasure.INCIDENT_RESPONSE,
    ],
    retentionPeriod: 730,
  },

  compliance_monitoring: {
    legalBasis: LegalBasis.LEGAL_OBLIGATION,
    purposes: [ProcessingPurpose.COMPLIANCE_MONITORING, ProcessingPurpose.AUDIT_TRAIL],
    dataCategories: [DataCategory.TECHNICAL, DataCategory.BEHAVIORAL],
    securityMeasures: [
      SecurityMeasure.ENCRYPTION_AT_REST,
      SecurityMeasure.ACCESS_CONTROL,
      SecurityMeasure.AUDIT_LOGGING,
      SecurityMeasure.WORM_LOGGING,
      SecurityMeasure.OBJECT_LOCK,
      SecurityMeasure.HASH_CHAIN,
    ],
    retentionPeriod: 2555, // 7 anos para auditoria
  },
};

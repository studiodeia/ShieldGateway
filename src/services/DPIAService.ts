import { 
  DPIAStub, 
  LegalBasis, 
  ProcessingPurpose, 
  DataCategory, 
  SecurityMeasure 
} from '../types/compliance';
import pino from 'pino';

const logger = pino({
  name: 'core:dpia',
  level: process.env.LOG_LEVEL || 'info',
});

export class DPIAService {
  
  /**
   * Gera um stub de DPIA para o GuardAgent
   */
  generateDPIAStub(): DPIAStub {
    const timestamp = new Date().toISOString();
    const version = process.env.npm_package_version || '0.1.0';
    
    return {
      id: `DPIA-GUARDAGENT-${new Date().getFullYear()}-001`,
      version: `v${version}`,
      createdAt: timestamp,
      lastUpdated: timestamp,
      
      processing: {
        name: 'GuardAgent - AI Security Gateway',
        description: 'Sistema de gateway de segurança para inteligência artificial que analisa, monitora e protege interações com modelos de linguagem (LLMs) para garantir conformidade com LGPD/GDPR e prevenir vazamentos de dados.',
        purposes: [
          ProcessingPurpose.AI_SECURITY,
          ProcessingPurpose.CONTENT_MODERATION,
          ProcessingPurpose.FRAUD_PREVENTION,
          ProcessingPurpose.COMPLIANCE_MONITORING,
          ProcessingPurpose.AUDIT_TRAIL,
          ProcessingPurpose.SECURITY_INCIDENT,
        ],
        legalBasis: [
          LegalBasis.LEGITIMATE_INTEREST,
          LegalBasis.LEGAL_OBLIGATION,
          LegalBasis.CONSENT,
        ],
        dataController: {
          name: process.env.DATA_CONTROLLER_NAME || 'GuardAgent Corp',
          contact: process.env.DATA_CONTROLLER_CONTACT || 'privacy@guardagent.io',
          dpoContact: process.env.DPO_CONTACT || 'dpo@guardagent.io',
        },
      },
      
      personalData: {
        categories: [
          DataCategory.CONTENT,
          DataCategory.TECHNICAL,
          DataCategory.BEHAVIORAL,
          DataCategory.IDENTIFICATION,
          DataCategory.CONTACT,
        ],
        sources: [
          'Usuários finais através de aplicações integradas',
          'Sistemas automatizados de monitoramento',
          'Logs de aplicações e infraestrutura',
          'APIs de terceiros integradas',
        ],
        recipients: [
          'Equipe técnica autorizada do GuardAgent',
          'Sistemas de auditoria e compliance',
          'Autoridades competentes (quando legalmente obrigatório)',
          'Prestadores de serviços de infraestrutura (AWS)',
        ],
        retentionPeriod: 2555, // 7 anos para conformidade
        crossBorderTransfer: true,
        adequacyDecision: 'AWS adequacy decision for EU-US data transfers',
      },
      
      riskAssessment: {
        riskLevel: 'medium',
        identifiedRisks: [
          'Vazamento acidental de dados pessoais através de logs',
          'Acesso não autorizado a conteúdo sensível',
          'Falha na detecção de prompt injection',
          'Perda de integridade dos logs de auditoria',
          'Transferência internacional inadequada de dados',
          'Retenção excessiva de dados pessoais',
          'Falha na resposta a direitos dos titulares',
        ],
        mitigationMeasures: [
          SecurityMeasure.ENCRYPTION_AT_REST,
          SecurityMeasure.ENCRYPTION_IN_TRANSIT,
          SecurityMeasure.ACCESS_CONTROL,
          SecurityMeasure.AUDIT_LOGGING,
          SecurityMeasure.WORM_LOGGING,
          SecurityMeasure.HASH_CHAIN,
          SecurityMeasure.OBJECT_LOCK,
          SecurityMeasure.DATA_MINIMIZATION,
          SecurityMeasure.PSEUDONYMIZATION,
          SecurityMeasure.RETENTION_POLICY,
          SecurityMeasure.INCIDENT_RESPONSE,
          SecurityMeasure.STAFF_TRAINING,
          SecurityMeasure.REGULAR_ASSESSMENT,
        ],
        residualRisk: 'low',
      },
      
      securityMeasures: {
        technical: [
          SecurityMeasure.ENCRYPTION_AT_REST,
          SecurityMeasure.ENCRYPTION_IN_TRANSIT,
          SecurityMeasure.ACCESS_CONTROL,
          SecurityMeasure.AUDIT_LOGGING,
          SecurityMeasure.WORM_LOGGING,
          SecurityMeasure.HASH_CHAIN,
          SecurityMeasure.OBJECT_LOCK,
          SecurityMeasure.DATA_MINIMIZATION,
          SecurityMeasure.PSEUDONYMIZATION,
          SecurityMeasure.ANONYMIZATION,
        ],
        organizational: [
          'Política de Privacidade e Proteção de Dados',
          'Procedimentos de Resposta a Incidentes',
          'Treinamento regular da equipe em LGPD/GDPR',
          'Avaliações periódicas de impacto à privacidade',
          'Contratos de processamento com fornecedores',
          'Procedimentos de exercício de direitos dos titulares',
          'Auditoria interna trimestral',
          'Revisão anual da DPIA',
        ],
        hashChainReference: `hash-chain-${timestamp}`,
      },
      
      dataSubjectRights: {
        accessProcedure: 'Solicitação via API /v1/dsr/access ou email para dpo@guardagent.io. Resposta em até 15 dias úteis.',
        rectificationProcedure: 'Solicitação via API /v1/dsr/rectification ou email. Correção em até 5 dias úteis após validação.',
        erasureProcedure: 'Solicitação via API /v1/dsr/erasure ou email. Exclusão em até 30 dias, respeitando obrigações legais.',
        portabilityProcedure: 'Solicitação via API /v1/dsr/portability. Dados fornecidos em formato JSON estruturado.',
        objectionProcedure: 'Solicitação via API /v1/dsr/objection ou email. Análise e resposta em até 15 dias úteis.',
        complaintProcedure: 'Contato com DPO via dpo@guardagent.io ou ANPD/autoridade supervisora competente.',
      },
    };
  }
  
  /**
   * Gera HTML para o DPIA stub
   */
  generateDPIAHTML(dpia: DPIAStub): string {
    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DPIA - ${dpia.processing.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        .section h2 { color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
        .section h3 { color: #555; margin-top: 20px; }
        .metadata { background: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .risk-high { color: #d32f2f; font-weight: bold; }
        .risk-medium { color: #f57c00; font-weight: bold; }
        .risk-low { color: #388e3c; font-weight: bold; }
        ul { padding-left: 20px; }
        li { margin-bottom: 5px; }
        .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Data Protection Impact Assessment (DPIA)</h1>
        <h2>${dpia.processing.name}</h2>
        <div class="metadata">
            <strong>ID:</strong> ${dpia.id} | 
            <strong>Versão:</strong> ${dpia.version} | 
            <strong>Criado em:</strong> ${new Date(dpia.createdAt).toLocaleDateString('pt-BR')} |
            <strong>Atualizado em:</strong> ${new Date(dpia.lastUpdated).toLocaleDateString('pt-BR')}
        </div>
    </div>

    <div class="section">
        <h2>1. Identificação do Tratamento</h2>
        <h3>Nome do Tratamento</h3>
        <p>${dpia.processing.name}</p>
        
        <h3>Descrição</h3>
        <p>${dpia.processing.description}</p>
        
        <h3>Finalidades</h3>
        <ul>
            ${dpia.processing.purposes.map(purpose => `<li>${purpose.replace(/_/g, ' ').toUpperCase()}</li>`).join('')}
        </ul>
        
        <h3>Bases Legais</h3>
        <ul>
            ${dpia.processing.legalBasis.map(basis => `<li>${basis.replace(/_/g, ' ').toUpperCase()}</li>`).join('')}
        </ul>
        
        <h3>Controlador de Dados</h3>
        <p><strong>Nome:</strong> ${dpia.processing.dataController.name}</p>
        <p><strong>Contato:</strong> ${dpia.processing.dataController.contact}</p>
        <p><strong>DPO:</strong> ${dpia.processing.dataController.dpoContact}</p>
    </div>

    <div class="section">
        <h2>2. Dados Pessoais</h2>
        <h3>Categorias de Dados</h3>
        <ul>
            ${dpia.personalData.categories.map(cat => `<li>${cat.replace(/_/g, ' ').toUpperCase()}</li>`).join('')}
        </ul>
        
        <h3>Fontes dos Dados</h3>
        <ul>
            ${dpia.personalData.sources.map(source => `<li>${source}</li>`).join('')}
        </ul>
        
        <h3>Destinatários</h3>
        <ul>
            ${dpia.personalData.recipients.map(recipient => `<li>${recipient}</li>`).join('')}
        </ul>
        
        <h3>Retenção</h3>
        <p><strong>Período:</strong> ${dpia.personalData.retentionPeriod} dias (${Math.round(dpia.personalData.retentionPeriod / 365)} anos)</p>
        
        <h3>Transferência Internacional</h3>
        <p><strong>Ocorre:</strong> ${dpia.personalData.crossBorderTransfer ? 'Sim' : 'Não'}</p>
        ${dpia.personalData.adequacyDecision ? `<p><strong>Decisão de Adequação:</strong> ${dpia.personalData.adequacyDecision}</p>` : ''}
    </div>

    <div class="section">
        <h2>3. Avaliação de Risco</h2>
        <h3>Nível de Risco</h3>
        <p class="risk-${dpia.riskAssessment.riskLevel}">${dpia.riskAssessment.riskLevel.toUpperCase()}</p>
        
        <h3>Riscos Identificados</h3>
        <ul>
            ${dpia.riskAssessment.identifiedRisks.map(risk => `<li>${risk}</li>`).join('')}
        </ul>
        
        <h3>Medidas de Mitigação</h3>
        <ul>
            ${dpia.riskAssessment.mitigationMeasures.map(measure => `<li>${measure.replace(/_/g, ' ').toUpperCase()}</li>`).join('')}
        </ul>
        
        <h3>Risco Residual</h3>
        <p class="risk-${dpia.riskAssessment.residualRisk}">${dpia.riskAssessment.residualRisk.toUpperCase()}</p>
    </div>

    <div class="section">
        <h2>4. Medidas de Segurança</h2>
        <h3>Medidas Técnicas</h3>
        <ul>
            ${dpia.securityMeasures.technical.map(measure => `<li>${measure.replace(/_/g, ' ').toUpperCase()}</li>`).join('')}
        </ul>
        
        <h3>Medidas Organizacionais</h3>
        <ul>
            ${dpia.securityMeasures.organizational.map(measure => `<li>${measure}</li>`).join('')}
        </ul>
        
        <h3>Referência Hash-Chain</h3>
        <p><code>${dpia.securityMeasures.hashChainReference}</code></p>
    </div>

    <div class="section">
        <h2>5. Direitos dos Titulares</h2>
        <h3>Acesso</h3>
        <p>${dpia.dataSubjectRights.accessProcedure}</p>
        
        <h3>Retificação</h3>
        <p>${dpia.dataSubjectRights.rectificationProcedure}</p>
        
        <h3>Exclusão</h3>
        <p>${dpia.dataSubjectRights.erasureProcedure}</p>
        
        <h3>Portabilidade</h3>
        <p>${dpia.dataSubjectRights.portabilityProcedure}</p>
        
        <h3>Oposição</h3>
        <p>${dpia.dataSubjectRights.objectionProcedure}</p>
        
        <h3>Reclamação</h3>
        <p>${dpia.dataSubjectRights.complaintProcedure}</p>
    </div>

    <div class="footer">
        <p>Este documento foi gerado automaticamente pelo GuardAgent Core em ${new Date().toLocaleString('pt-BR')}.</p>
        <p>Para mais informações, entre em contato com ${dpia.processing.dataController.dpoContact}</p>
    </div>
</body>
</html>`;
  }
  
  /**
   * Gera DPIA em formato JSON
   */
  generateDPIAJSON(dpia: DPIAStub): string {
    return JSON.stringify(dpia, null, 2);
  }
}

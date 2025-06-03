import { DPIAService } from '../src/services/DPIAService';
import { LegalBasis, ProcessingPurpose, DataCategory, SecurityMeasure } from '../src/types/compliance';

describe('DPIAService', () => {
  let dpiaService: DPIAService;

  beforeEach(() => {
    dpiaService = new DPIAService();
  });

  describe('generateDPIAStub', () => {
    test('should generate complete DPIA stub', () => {
      const dpia = dpiaService.generateDPIAStub();

      expect(dpia.id).toMatch(/^DPIA-GUARDAGENT-\d{4}-001$/);
      expect(dpia.version).toMatch(/^v\d+\.\d+\.\d+$/);
      expect(dpia.createdAt).toBeDefined();
      expect(dpia.lastUpdated).toBeDefined();
    });

    test('should include required processing information', () => {
      const dpia = dpiaService.generateDPIAStub();

      expect(dpia.processing.name).toBe('GuardAgent - AI Security Gateway');
      expect(dpia.processing.description).toContain('gateway de segurança');
      expect(dpia.processing.purposes).toContain(ProcessingPurpose.AI_SECURITY);
      expect(dpia.processing.purposes).toContain(ProcessingPurpose.COMPLIANCE_MONITORING);
      expect(dpia.processing.legalBasis).toContain(LegalBasis.LEGITIMATE_INTEREST);
      expect(dpia.processing.legalBasis).toContain(LegalBasis.LEGAL_OBLIGATION);
    });

    test('should include comprehensive data categories', () => {
      const dpia = dpiaService.generateDPIAStub();

      expect(dpia.personalData.categories).toContain(DataCategory.CONTENT);
      expect(dpia.personalData.categories).toContain(DataCategory.TECHNICAL);
      expect(dpia.personalData.categories).toContain(DataCategory.BEHAVIORAL);
      expect(dpia.personalData.categories).toContain(DataCategory.IDENTIFICATION);
      expect(dpia.personalData.categories).toContain(DataCategory.CONTACT);
    });

    test('should include data sources and recipients', () => {
      const dpia = dpiaService.generateDPIAStub();

      expect(dpia.personalData.sources).toContain('Usuários finais através de aplicações integradas');
      expect(dpia.personalData.sources).toContain('Sistemas automatizados de monitoramento');
      expect(dpia.personalData.recipients).toContain('Equipe técnica autorizada do GuardAgent');
      expect(dpia.personalData.recipients).toContain('Sistemas de auditoria e compliance');
    });

    test('should set appropriate retention period', () => {
      const dpia = dpiaService.generateDPIAStub();

      expect(dpia.personalData.retentionPeriod).toBe(2555); // 7 anos
      expect(dpia.personalData.crossBorderTransfer).toBe(true);
      expect(dpia.personalData.adequacyDecision).toContain('AWS adequacy decision');
    });

    test('should include comprehensive risk assessment', () => {
      const dpia = dpiaService.generateDPIAStub();

      expect(dpia.riskAssessment.riskLevel).toBe('medium');
      expect(dpia.riskAssessment.residualRisk).toBe('low');
      expect(dpia.riskAssessment.identifiedRisks.length).toBeGreaterThan(5);
      expect(dpia.riskAssessment.identifiedRisks).toContain('Vazamento acidental de dados pessoais através de logs');
      expect(dpia.riskAssessment.identifiedRisks).toContain('Falha na detecção de prompt injection');
    });

    test('should include comprehensive security measures', () => {
      const dpia = dpiaService.generateDPIAStub();

      // Medidas técnicas
      expect(dpia.securityMeasures.technical).toContain(SecurityMeasure.ENCRYPTION_AT_REST);
      expect(dpia.securityMeasures.technical).toContain(SecurityMeasure.ENCRYPTION_IN_TRANSIT);
      expect(dpia.securityMeasures.technical).toContain(SecurityMeasure.WORM_LOGGING);
      expect(dpia.securityMeasures.technical).toContain(SecurityMeasure.HASH_CHAIN);
      expect(dpia.securityMeasures.technical).toContain(SecurityMeasure.OBJECT_LOCK);

      // Medidas organizacionais
      expect(dpia.securityMeasures.organizational).toContain('Política de Privacidade e Proteção de Dados');
      expect(dpia.securityMeasures.organizational).toContain('Treinamento regular da equipe em LGPD/GDPR');
      expect(dpia.securityMeasures.organizational).toContain('Auditoria interna trimestral');

      // Hash chain reference
      expect(dpia.securityMeasures.hashChainReference).toMatch(/^hash-chain-\d{4}-\d{2}-\d{2}T/);
    });

    test('should include data subject rights procedures', () => {
      const dpia = dpiaService.generateDPIAStub();

      expect(dpia.dataSubjectRights.accessProcedure).toContain('/v1/dsr/access');
      expect(dpia.dataSubjectRights.accessProcedure).toContain('15 dias úteis');
      expect(dpia.dataSubjectRights.erasureProcedure).toContain('/v1/dsr/erasure');
      expect(dpia.dataSubjectRights.erasureProcedure).toContain('30 dias');
      expect(dpia.dataSubjectRights.rectificationProcedure).toContain('5 dias úteis');
      expect(dpia.dataSubjectRights.portabilityProcedure).toContain('JSON estruturado');
      expect(dpia.dataSubjectRights.complaintProcedure).toContain('ANPD');
    });

    test('should include controller information', () => {
      const dpia = dpiaService.generateDPIAStub();

      expect(dpia.processing.dataController.name).toBeDefined();
      expect(dpia.processing.dataController.contact).toContain('@');
      expect(dpia.processing.dataController.dpoContact).toContain('dpo@');
    });
  });

  describe('generateDPIAHTML', () => {
    test('should generate valid HTML', () => {
      const dpia = dpiaService.generateDPIAStub();
      const html = dpiaService.generateDPIAHTML(dpia);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="pt-BR">');
      expect(html).toContain('<title>DPIA - GuardAgent - AI Security Gateway</title>');
      expect(html).toContain('</html>');
    });

    test('should include DPIA metadata in HTML', () => {
      const dpia = dpiaService.generateDPIAStub();
      const html = dpiaService.generateDPIAHTML(dpia);

      expect(html).toContain(dpia.id);
      expect(html).toContain(dpia.version);
      expect(html).toContain(dpia.processing.name);
      expect(html).toContain(dpia.processing.dataController.name);
    });

    test('should include risk assessment in HTML', () => {
      const dpia = dpiaService.generateDPIAStub();
      const html = dpiaService.generateDPIAHTML(dpia);

      expect(html).toContain('class="risk-medium"');
      expect(html).toContain('MEDIUM');
      expect(html).toContain('Riscos Identificados');
      expect(html).toContain('Medidas de Mitigação');
    });

    test('should include legal basis information', () => {
      const dpia = dpiaService.generateDPIAStub();
      const html = dpiaService.generateDPIAHTML(dpia);

      expect(html).toContain('Bases Legais');
      expect(html).toContain('LEGITIMATE_INTEREST');
      expect(html).toContain('LEGAL_OBLIGATION');
    });

    test('should include data categories', () => {
      const dpia = dpiaService.generateDPIAStub();
      const html = dpiaService.generateDPIAHTML(dpia);

      expect(html).toContain('Categorias de Dados');
      expect(html).toContain('CONTENT');
      expect(html).toContain('TECHNICAL');
      expect(html).toContain('BEHAVIORAL');
    });

    test('should include security measures', () => {
      const dpia = dpiaService.generateDPIAStub();
      const html = dpiaService.generateDPIAHTML(dpia);

      expect(html).toContain('Medidas Técnicas');
      expect(html).toContain('Medidas Organizacionais');
      expect(html).toContain('ENCRYPTION_AT_REST');
      expect(html).toContain('WORM_LOGGING');
      expect(html).toContain('Política de Privacidade');
    });

    test('should include data subject rights', () => {
      const dpia = dpiaService.generateDPIAStub();
      const html = dpiaService.generateDPIAHTML(dpia);

      expect(html).toContain('Direitos dos Titulares');
      expect(html).toContain('Acesso');
      expect(html).toContain('Retificação');
      expect(html).toContain('Exclusão');
      expect(html).toContain('Portabilidade');
      expect(html).toContain('Oposição');
      expect(html).toContain('Reclamação');
    });

    test('should include footer with generation timestamp', () => {
      const dpia = dpiaService.generateDPIAStub();
      const html = dpiaService.generateDPIAHTML(dpia);

      expect(html).toContain('Este documento foi gerado automaticamente');
      expect(html).toContain('GuardAgent Core');
      expect(html).toContain(dpia.processing.dataController.dpoContact);
    });
  });

  describe('generateDPIAJSON', () => {
    test('should generate valid JSON', () => {
      const dpia = dpiaService.generateDPIAStub();
      const json = dpiaService.generateDPIAJSON(dpia);

      expect(() => JSON.parse(json)).not.toThrow();
      
      const parsed = JSON.parse(json);
      expect(parsed.id).toBe(dpia.id);
      expect(parsed.version).toBe(dpia.version);
      expect(parsed.processing.name).toBe(dpia.processing.name);
    });

    test('should include all DPIA sections in JSON', () => {
      const dpia = dpiaService.generateDPIAStub();
      const json = dpiaService.generateDPIAJSON(dpia);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveProperty('id');
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('processing');
      expect(parsed).toHaveProperty('personalData');
      expect(parsed).toHaveProperty('riskAssessment');
      expect(parsed).toHaveProperty('securityMeasures');
      expect(parsed).toHaveProperty('dataSubjectRights');
    });

    test('should preserve data types in JSON', () => {
      const dpia = dpiaService.generateDPIAStub();
      const json = dpiaService.generateDPIAJSON(dpia);
      const parsed = JSON.parse(json);

      expect(typeof parsed.personalData.retentionPeriod).toBe('number');
      expect(typeof parsed.personalData.crossBorderTransfer).toBe('boolean');
      expect(Array.isArray(parsed.processing.purposes)).toBe(true);
      expect(Array.isArray(parsed.personalData.categories)).toBe(true);
    });
  });

  describe('performance', () => {
    test('should generate DPIA stub quickly', () => {
      const startTime = Date.now();
      const dpia = dpiaService.generateDPIAStub();
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(100); // Menos de 100ms
      expect(dpia).toBeDefined();
    });

    test('should generate HTML quickly', () => {
      const dpia = dpiaService.generateDPIAStub();
      
      const startTime = Date.now();
      const html = dpiaService.generateDPIAHTML(dpia);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(50); // Menos de 50ms
      expect(html.length).toBeGreaterThan(1000);
    });

    test('should handle multiple concurrent generations', async () => {
      const promises = Array.from({ length: 10 }, () => 
        Promise.resolve(dpiaService.generateDPIAStub())
      );

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(500); // Menos de 500ms para 10 gerações
      expect(results).toHaveLength(10);
      expect(results.every(dpia => dpia.id.startsWith('DPIA-GUARDAGENT'))).toBe(true);
    });
  });
});

import { Router, Request, Response } from 'express';
import { DPIAService } from '../services/DPIAService';
import pino from 'pino';

const logger = pino({
  name: 'core:dpia',
  level: process.env.LOG_LEVEL || 'info',
});

const router = Router();
const dpiaService = new DPIAService();

/**
 * GET /v1/dpia/stub
 * Gera stub de DPIA em formato HTML ou JSON
 */
router.get('/stub', async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const format = req.query.format as string || 'html';
    const download = req.query.download === 'true';
    
    logger.info('DPIA stub requested', {
      requestId: (req as any).requestId,
      format,
      download,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    });
    
    // Gerar DPIA stub
    const dpia = dpiaService.generateDPIAStub();
    
    const processingTime = Date.now() - startTime;
    
    if (format === 'json') {
      const jsonContent = dpiaService.generateDPIAJSON(dpia);
      
      if (download) {
        res.setHeader('Content-Disposition', `attachment; filename="dpia-${dpia.id}.json"`);
      }
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Processing-Time', processingTime.toString());
      res.setHeader('X-DPIA-ID', dpia.id);
      res.setHeader('X-DPIA-Version', dpia.version);
      
      return res.send(jsonContent);
    }
    
    // Default: HTML
    const htmlContent = dpiaService.generateDPIAHTML(dpia);
    
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="dpia-${dpia.id}.html"`);
    }
    
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Processing-Time', processingTime.toString());
    res.setHeader('X-DPIA-ID', dpia.id);
    res.setHeader('X-DPIA-Version', dpia.version);
    
    logger.info('DPIA stub generated', {
      requestId: (req as any).requestId,
      dpiaId: dpia.id,
      format,
      processingTime,
      contentLength: htmlContent.length,
    });
    
    res.send(htmlContent);
    
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error('DPIA stub generation failed:', {
      error: error instanceof Error ? error.message : error,
      requestId: (req as any).requestId,
      processingTime,
    });
    
    res.status(500).json({
      error: 'Failed to generate DPIA stub',
      timestamp: new Date().toISOString(),
      processingTime,
    });
  }
});

/**
 * GET /v1/dpia/metadata
 * Retorna metadados da DPIA atual
 */
router.get('/metadata', async (req: Request, res: Response) => {
  try {
    const dpia = dpiaService.generateDPIAStub();
    
    const metadata = {
      id: dpia.id,
      version: dpia.version,
      createdAt: dpia.createdAt,
      lastUpdated: dpia.lastUpdated,
      controller: dpia.processing.dataController,
      riskLevel: dpia.riskAssessment.riskLevel,
      residualRisk: dpia.riskAssessment.residualRisk,
      retentionPeriod: dpia.personalData.retentionPeriod,
      crossBorderTransfer: dpia.personalData.crossBorderTransfer,
      hashChainReference: dpia.securityMeasures.hashChainReference,
    };
    
    logger.info('DPIA metadata requested', {
      requestId: (req as any).requestId,
      dpiaId: dpia.id,
    });
    
    res.json(metadata);
    
  } catch (error) {
    logger.error('DPIA metadata request failed:', error);
    
    res.status(500).json({
      error: 'Failed to retrieve DPIA metadata',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /v1/dpia/compliance-check
 * Verifica conformidade atual com LGPD/GDPR
 */
router.get('/compliance-check', async (req: Request, res: Response) => {
  try {
    const dpia = dpiaService.generateDPIAStub();
    
    // Verificações de conformidade
    const checks = {
      legalBasisDefined: dpia.processing.legalBasis.length > 0,
      purposesSpecified: dpia.processing.purposes.length > 0,
      securityMeasuresImplemented: dpia.securityMeasures.technical.length >= 5,
      retentionPolicyDefined: dpia.personalData.retentionPeriod > 0,
      dataSubjectRightsProcedures: Object.keys(dpia.dataSubjectRights).length >= 6,
      riskAssessmentCompleted: dpia.riskAssessment.identifiedRisks.length > 0,
      dpoContactAvailable: !!dpia.processing.dataController.dpoContact,
      hashChainImplemented: !!dpia.securityMeasures.hashChainReference,
    };
    
    const totalChecks = Object.keys(checks).length;
    const passedChecks = Object.values(checks).filter(Boolean).length;
    const complianceScore = Math.round((passedChecks / totalChecks) * 100);
    
    const result = {
      complianceScore,
      totalChecks,
      passedChecks,
      status: complianceScore >= 90 ? 'compliant' : complianceScore >= 70 ? 'partially_compliant' : 'non_compliant',
      checks,
      recommendations: [],
      timestamp: new Date().toISOString(),
    };
    
    // Gerar recomendações
    if (!checks.legalBasisDefined) {
      result.recommendations.push('Definir bases legais específicas para cada finalidade');
    }
    if (!checks.securityMeasuresImplemented) {
      result.recommendations.push('Implementar medidas de segurança técnicas adicionais');
    }
    if (!checks.dpoContactAvailable) {
      result.recommendations.push('Designar e disponibilizar contato do DPO');
    }
    if (complianceScore < 90) {
      result.recommendations.push('Revisar e atualizar procedimentos de conformidade');
    }
    
    logger.info('Compliance check performed', {
      requestId: (req as any).requestId,
      complianceScore,
      status: result.status,
    });
    
    res.json(result);
    
  } catch (error) {
    logger.error('Compliance check failed:', error);
    
    res.status(500).json({
      error: 'Failed to perform compliance check',
      timestamp: new Date().toISOString(),
    });
  }
});

export { router as dpiaRouter };

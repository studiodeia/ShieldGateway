import { Request, Response, NextFunction } from 'express';
import { legalBasisMiddleware, validateLegalBasisForPurpose } from '../src/middleware/legalBasis';
import { LegalBasis, ProcessingPurpose } from '../src/types/compliance';

// Mock do pino logger
jest.mock('pino', () => {
  return jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  }));
});

describe('legalBasisMiddleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      path: '/v1/guard',
      get: jest.fn(),
      body: {},
      headers: {},
      requestId: 'test-request-id',
    };

    mockResponse = {
      setHeader: jest.fn(),
    };

    mockNext = jest.fn();
  });

  describe('determineLegalBasis', () => {
    test('should determine legitimate interest for guard endpoints', () => {
      mockRequest.path = '/v1/guard';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect((mockRequest as any).complianceMetadata.legalBasis).toBe(LegalBasis.LEGITIMATE_INTEREST);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Legal-Basis', LegalBasis.LEGITIMATE_INTEREST);
    });

    test('should determine legal obligation for health endpoints', () => {
      mockRequest.path = '/v1/health';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect((mockRequest as any).complianceMetadata.legalBasis).toBe(LegalBasis.LEGAL_OBLIGATION);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Legal-Basis', LegalBasis.LEGAL_OBLIGATION);
    });

    test('should determine legal obligation for metrics endpoints', () => {
      mockRequest.path = '/metrics';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect((mockRequest as any).complianceMetadata.legalBasis).toBe(LegalBasis.LEGAL_OBLIGATION);
    });

    test('should determine legal obligation for DSR endpoints', () => {
      mockRequest.path = '/v1/dsr/access';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect((mockRequest as any).complianceMetadata.legalBasis).toBe(LegalBasis.LEGAL_OBLIGATION);
    });

    test('should determine legal obligation for DPIA endpoints', () => {
      mockRequest.path = '/v1/dpia/stub';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect((mockRequest as any).complianceMetadata.legalBasis).toBe(LegalBasis.LEGAL_OBLIGATION);
    });

    test('should default to legitimate interest for unknown endpoints', () => {
      mockRequest.path = '/v1/unknown';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect((mockRequest as any).complianceMetadata.legalBasis).toBe(LegalBasis.LEGITIMATE_INTEREST);
    });
  });

  describe('determinePurposes', () => {
    test('should include AI security for guard endpoints', () => {
      mockRequest.path = '/v1/guard';
      mockRequest.body = { content: 'test content' };
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const purposes = (mockRequest as any).complianceMetadata.purposes;
      expect(purposes).toContain(ProcessingPurpose.AI_SECURITY);
      expect(purposes).toContain(ProcessingPurpose.CONTENT_MODERATION);
      expect(purposes).toContain(ProcessingPurpose.AUDIT_TRAIL);
    });

    test('should include fraud prevention for high security policy', () => {
      mockRequest.path = '/v1/guard';
      mockRequest.body = { 
        content: 'test content',
        stage: 'input',
        policy: 'highSecurity'
      };
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const purposes = (mockRequest as any).complianceMetadata.purposes;
      expect(purposes).toContain(ProcessingPurpose.FRAUD_PREVENTION);
    });

    test('should include performance analytics for health endpoints', () => {
      mockRequest.path = '/v1/health';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const purposes = (mockRequest as any).complianceMetadata.purposes;
      expect(purposes).toContain(ProcessingPurpose.PERFORMANCE_ANALYTICS);
      expect(purposes).toContain(ProcessingPurpose.COMPLIANCE_MONITORING);
    });

    test('should include legal defense for DSR endpoints', () => {
      mockRequest.path = '/v1/dsr/access';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const purposes = (mockRequest as any).complianceMetadata.purposes;
      expect(purposes).toContain(ProcessingPurpose.LEGAL_DEFENSE);
    });

    test('should always include audit trail', () => {
      mockRequest.path = '/v1/unknown';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const purposes = (mockRequest as any).complianceMetadata.purposes;
      expect(purposes).toContain(ProcessingPurpose.AUDIT_TRAIL);
    });
  });

  describe('determineDataCategories', () => {
    test('should always include technical data', () => {
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const categories = (mockRequest as any).complianceMetadata.dataCategories;
      expect(categories).toContain('technical');
    });

    test('should include content when body has content', () => {
      mockRequest.body = { content: 'test content' };
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const categories = (mockRequest as any).complianceMetadata.dataCategories;
      expect(categories).toContain('content');
    });

    test('should include identification when user ID is present', () => {
      mockRequest.headers = { 'x-user-id': 'user123' };
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const categories = (mockRequest as any).complianceMetadata.dataCategories;
      expect(categories).toContain('identification');
    });

    test('should include behavioral for guard endpoints', () => {
      mockRequest.path = '/v1/guard';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const categories = (mockRequest as any).complianceMetadata.dataCategories;
      expect(categories).toContain('behavioral');
    });

    test('should include contact when email is present', () => {
      mockRequest.body = { email: 'test@example.com' };
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const categories = (mockRequest as any).complianceMetadata.dataCategories;
      expect(categories).toContain('contact');
    });
  });

  describe('determineRetentionPeriod', () => {
    test('should set 7 years for compliance monitoring', () => {
      mockRequest.path = '/v1/dpia/stub';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const retentionPeriod = (mockRequest as any).complianceMetadata.retentionPeriod;
      expect(retentionPeriod).toBe(2555); // 7 anos
    });

    test('should set 3 years for fraud prevention', () => {
      mockRequest.path = '/v1/guard';
      mockRequest.body = { 
        content: 'test',
        stage: 'input',
        policy: 'highSecurity'
      };
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const retentionPeriod = (mockRequest as any).complianceMetadata.retentionPeriod;
      expect(retentionPeriod).toBe(1095); // 3 anos
    });

    test('should set 2 years for AI security', () => {
      mockRequest.path = '/v1/guard';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const retentionPeriod = (mockRequest as any).complianceMetadata.retentionPeriod;
      expect(retentionPeriod).toBe(730); // 2 anos
    });

    test('should default to 1 year', () => {
      mockRequest.path = '/v1/unknown';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const retentionPeriod = (mockRequest as any).complianceMetadata.retentionPeriod;
      expect(retentionPeriod).toBe(365); // 1 ano
    });
  });

  describe('headers and metadata', () => {
    test('should set all required headers', () => {
      mockRequest.path = '/v1/guard';
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Legal-Basis', LegalBasis.LEGITIMATE_INTEREST);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Processing-Purposes', expect.any(String));
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Retention-Period', expect.any(String));
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-DPIA-Reference', expect.any(String));
    });

    test('should include all required metadata fields', () => {
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const metadata = (mockRequest as any).complianceMetadata;
      expect(metadata).toHaveProperty('legalBasis');
      expect(metadata).toHaveProperty('purposes');
      expect(metadata).toHaveProperty('dataCategories');
      expect(metadata).toHaveProperty('securityMeasures');
      expect(metadata).toHaveProperty('retentionPeriod');
      expect(metadata).toHaveProperty('timestamp');
      expect(metadata).toHaveProperty('requestId');
      expect(metadata).toHaveProperty('dpiaReference');
    });

    test('should include user context when available', () => {
      mockRequest.headers = { 
        'x-user-id': 'user123',
        'x-consent-id': 'consent456'
      };
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const metadata = (mockRequest as any).complianceMetadata;
      expect(metadata.dataSubjectId).toBe('user123');
      expect(metadata.consentId).toBe('consent456');
    });
  });

  describe('error handling', () => {
    test('should handle errors gracefully', () => {
      // Simular erro no middleware
      mockRequest.path = null as any;
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      // Deve criar metadata padrão seguro
      const metadata = (mockRequest as any).complianceMetadata;
      expect(metadata.legalBasis).toBe(LegalBasis.LEGITIMATE_INTEREST);
      expect(metadata.purposes).toContain(ProcessingPurpose.AI_SECURITY);
      expect(metadata.retentionPeriod).toBe(365);
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('performance', () => {
    test('should process quickly', () => {
      const startTime = Date.now();
      
      legalBasisMiddleware(mockRequest as Request, mockResponse as Response, mockNext);
      
      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(50); // Menos de 50ms
      expect(mockNext).toHaveBeenCalled();
    });
  });
});

describe('validateLegalBasisForPurpose', () => {
  test('should validate compliance monitoring with legal obligation', () => {
    const isValid = validateLegalBasisForPurpose(
      LegalBasis.LEGAL_OBLIGATION,
      ProcessingPurpose.COMPLIANCE_MONITORING
    );
    expect(isValid).toBe(true);
  });

  test('should validate AI security with legitimate interest', () => {
    const isValid = validateLegalBasisForPurpose(
      LegalBasis.LEGITIMATE_INTEREST,
      ProcessingPurpose.AI_SECURITY
    );
    expect(isValid).toBe(true);
  });

  test('should validate AI security with consent', () => {
    const isValid = validateLegalBasisForPurpose(
      LegalBasis.CONSENT,
      ProcessingPurpose.AI_SECURITY
    );
    expect(isValid).toBe(true);
  });

  test('should validate legal defense with judicial process', () => {
    const isValid = validateLegalBasisForPurpose(
      LegalBasis.JUDICIAL_PROCESS,
      ProcessingPurpose.LEGAL_DEFENSE
    );
    expect(isValid).toBe(true);
  });

  test('should allow any basis for unrestricted purposes', () => {
    // Para finalidades que não têm restrições específicas
    const isValid = validateLegalBasisForPurpose(
      LegalBasis.CONTRACT,
      ProcessingPurpose.SERVICE_IMPROVEMENT
    );
    expect(isValid).toBe(true);
  });
});

import { RiskEngine, AnalysisContext } from '../services/RiskEngine';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

describe('RiskEngine', () => {
  let riskEngine: RiskEngine;
  const testConfigPath = path.join(__dirname, 'fixtures', 'test-risk-weights.yaml');

  beforeAll(() => {
    // Create test configuration
    const testConfig = {
      defaultWeights: [
        { vector: 'inj_prompt', weight: 0.4, description: 'Test injection weight' },
        { vector: 'data_category', weight: 0.3, description: 'Test data weight' },
        { vector: 'origin', weight: 0.2, description: 'Test origin weight' },
        { vector: 'tenant_reputation', weight: 0.1, description: 'Test tenant weight' },
      ],
      thresholds: { low: 25, medium: 65, high: 85, block: 75 },
      version: '1.0-test',
      lastUpdated: new Date().toISOString(),
      maintainer: 'Test Suite',
    };

    // Ensure fixtures directory exists
    const fixturesDir = path.dirname(testConfigPath);
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Write test configuration
    fs.writeFileSync(testConfigPath, yaml.dump(testConfig));

    // Set environment variable to use test config
    process.env.RISK_WEIGHTS_CONFIG_PATH = testConfigPath;

    riskEngine = RiskEngine.getInstance();
  });

  afterAll(() => {
    // Clean up test files
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
    
    // Remove fixtures directory if empty
    const fixturesDir = path.dirname(testConfigPath);
    try {
      fs.rmdirSync(fixturesDir);
    } catch {
      // Directory not empty or doesn't exist, ignore
    }

    delete process.env.RISK_WEIGHTS_CONFIG_PATH;
  });

  describe('Risk Score Calculation', () => {
    it('should calculate low risk score correctly', () => {
      const context: AnalysisContext = {
        requestId: 'test-001',
        injectionConfidence: 0.1,
        dataSensitivityIndex: 0.2,
        originTrustLevel: 0.8,
        tenantRiskProfile: 0.3,
      };

      const assessment = riskEngine.calculateRisk(context);

      expect(assessment.score).toBeLessThanOrEqual(25);
      expect(assessment.bucket).toBe('low');
      expect(assessment.shouldBlock).toBe(false);
    });

    it('should calculate medium risk score correctly', () => {
      const context: AnalysisContext = {
        requestId: 'test-002',
        injectionConfidence: 0.5,
        dataSensitivityIndex: 0.6,
        originTrustLevel: 0.4,
        tenantRiskProfile: 0.5,
      };

      const assessment = riskEngine.calculateRisk(context);

      expect(assessment.score).toBeGreaterThan(25);
      expect(assessment.score).toBeLessThanOrEqual(65);
      expect(assessment.bucket).toBe('medium');
      expect(assessment.shouldBlock).toBe(false);
    });

    it('should calculate high risk score correctly', () => {
      const context: AnalysisContext = {
        requestId: 'test-003',
        injectionConfidence: 0.9,
        dataSensitivityIndex: 0.8,
        originTrustLevel: 0.2,
        tenantRiskProfile: 0.7,
      };

      const assessment = riskEngine.calculateRisk(context);

      expect(assessment.score).toBeGreaterThan(65);
      expect(assessment.bucket).toBe('high');
      expect(assessment.shouldBlock).toBe(true);
    });

    it('should handle edge cases correctly', () => {
      // All zeros
      const zeroContext: AnalysisContext = {
        requestId: 'test-004',
        injectionConfidence: 0,
        dataSensitivityIndex: 0,
        originTrustLevel: 0,
        tenantRiskProfile: 0,
      };

      const zeroAssessment = riskEngine.calculateRisk(zeroContext);
      expect(zeroAssessment.score).toBe(0);
      expect(zeroAssessment.bucket).toBe('low');

      // All ones
      const maxContext: AnalysisContext = {
        requestId: 'test-005',
        injectionConfidence: 1,
        dataSensitivityIndex: 1,
        originTrustLevel: 1,
        tenantRiskProfile: 1,
      };

      const maxAssessment = riskEngine.calculateRisk(maxContext);
      expect(maxAssessment.score).toBe(100);
      expect(maxAssessment.bucket).toBe('high');
    });

    it('should clamp values outside 0-1 range', () => {
      const context: AnalysisContext = {
        requestId: 'test-006',
        injectionConfidence: 1.5, // Above 1
        dataSensitivityIndex: -0.1, // Below 0
        originTrustLevel: 0.5,
        tenantRiskProfile: 2.0, // Above 1
      };

      const assessment = riskEngine.calculateRisk(context);

      // Should not throw error and should produce valid score
      expect(assessment.score).toBeGreaterThanOrEqual(0);
      expect(assessment.score).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high']).toContain(assessment.bucket);
    });
  });

  describe('Configuration Management', () => {
    it('should return current configuration', () => {
      const config = riskEngine.getConfig();

      expect(config.defaultWeights).toHaveLength(4);
      expect(config.version).toBe('1.0-test');
      expect(config.thresholds.block).toBe(75);
    });

    it('should return configuration checksum', () => {
      const checksum = riskEngine.getConfigChecksum();

      expect(checksum).toBeDefined();
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBeGreaterThan(0);
    });
  });

  describe('Risk Assessment Properties', () => {
    it('should include all required properties in assessment', () => {
      const context: AnalysisContext = {
        requestId: 'test-007',
        tenantId: 'tenant-123',
        injectionConfidence: 0.6,
        dataSensitivityIndex: 0.4,
        originTrustLevel: 0.7,
        tenantRiskProfile: 0.3,
        metadata: { test: 'data' },
      };

      const assessment = riskEngine.calculateRisk(context);

      expect(assessment).toHaveProperty('score');
      expect(assessment).toHaveProperty('bucket');
      expect(assessment).toHaveProperty('shouldBlock');
      expect(assessment).toHaveProperty('factors');
      expect(assessment).toHaveProperty('weights');
      expect(assessment).toHaveProperty('timestamp');
      expect(assessment).toHaveProperty('configVersion');

      expect(assessment.factors).toHaveProperty('inj_prompt');
      expect(assessment.factors).toHaveProperty('data_category');
      expect(assessment.factors).toHaveProperty('origin');
      expect(assessment.factors).toHaveProperty('tenant_reputation');

      expect(assessment.weights).toHaveProperty('inj_prompt');
      expect(assessment.weights).toHaveProperty('data_category');
      expect(assessment.weights).toHaveProperty('origin');
      expect(assessment.weights).toHaveProperty('tenant_reputation');
    });

    it('should use default tenant risk profile when not provided', () => {
      const context: AnalysisContext = {
        requestId: 'test-008',
        injectionConfidence: 0.5,
        dataSensitivityIndex: 0.5,
        originTrustLevel: 0.5,
        // tenantRiskProfile not provided
      };

      const assessment = riskEngine.calculateRisk(context);

      expect(assessment.factors.tenant_reputation).toBe(0.5);
    });
  });

  describe('Regression Tests', () => {
    // Test cases to ensure score consistency across versions
    const regressionTestCases = [
      {
        name: 'Standard low risk case',
        context: {
          requestId: 'reg-001',
          injectionConfidence: 0.1,
          dataSensitivityIndex: 0.2,
          originTrustLevel: 0.8,
          tenantRiskProfile: 0.3,
        },
        expectedScoreRange: [0, 30],
        expectedBucket: 'low',
      },
      {
        name: 'Standard medium risk case',
        context: {
          requestId: 'reg-002',
          injectionConfidence: 0.4,
          dataSensitivityIndex: 0.5,
          originTrustLevel: 0.5,
          tenantRiskProfile: 0.4,
        },
        expectedScoreRange: [30, 70],
        expectedBucket: 'medium',
      },
      {
        name: 'High injection confidence',
        context: {
          requestId: 'reg-003',
          injectionConfidence: 0.9,
          dataSensitivityIndex: 0.3,
          originTrustLevel: 0.6,
          tenantRiskProfile: 0.2,
        },
        expectedScoreRange: [35, 65],
        expectedBucket: 'medium',
      },
      {
        name: 'High data sensitivity',
        context: {
          requestId: 'reg-004',
          injectionConfidence: 0.2,
          dataSensitivityIndex: 0.9,
          originTrustLevel: 0.7,
          tenantRiskProfile: 0.3,
        },
        expectedScoreRange: [25, 55],
        expectedBucket: 'medium',
      },
    ];

    regressionTestCases.forEach((testCase) => {
      it(`should maintain consistent scoring for: ${testCase.name}`, () => {
        const assessment = riskEngine.calculateRisk(testCase.context as AnalysisContext);

        expect(assessment.score).toBeGreaterThanOrEqual(testCase.expectedScoreRange[0]);
        expect(assessment.score).toBeLessThanOrEqual(testCase.expectedScoreRange[1]);
        expect(assessment.bucket).toBe(testCase.expectedBucket);
      });
    });
  });

  describe('Performance Tests', () => {
    it('should calculate risk scores efficiently', () => {
      const context: AnalysisContext = {
        requestId: 'perf-001',
        injectionConfidence: 0.5,
        dataSensitivityIndex: 0.5,
        originTrustLevel: 0.5,
        tenantRiskProfile: 0.5,
      };

      const startTime = Date.now();
      
      // Calculate 1000 risk scores
      for (let i = 0; i < 1000; i++) {
        riskEngine.calculateRisk({
          ...context,
          requestId: `perf-${i}`,
        });
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete 1000 calculations in under 100ms
      expect(duration).toBeLessThan(100);
    });
  });
});

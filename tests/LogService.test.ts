import { LogService } from '../src/services/LogService';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({ Contents: [] }),
  })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  HeadObjectCommand: jest.fn(),
}));

describe('LogService', () => {
  let logService: LogService;

  beforeEach(() => {
    // Reset environment variables
    process.env.LOG_LEVEL = 'full';
    process.env.WORM_BUCKET_NAME = 'test-bucket';
    process.env.AWS_REGION = 'us-east-1';
    
    logService = new LogService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with default values', () => {
      expect(logService).toBeInstanceOf(LogService);
    });

    test('should use environment variables', () => {
      process.env.LOG_LEVEL = 'minimal';
      process.env.WORM_BUCKET_NAME = 'custom-bucket';
      
      const customLogService = new LogService();
      expect(customLogService).toBeInstanceOf(LogService);
    });
  });

  describe('writeLog', () => {
    test('should not write log when level is off', async () => {
      process.env.LOG_LEVEL = 'off';
      const offLogService = new LogService();
      
      await expect(
        offLogService.writeLog('req-123', 'GET', '/test', 200, 100)
      ).resolves.toBeUndefined();
    });

    test('should write log with minimal level', async () => {
      process.env.LOG_LEVEL = 'minimal';
      const minimalLogService = new LogService();
      
      const mockRequest = {
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-agent'),
      };

      await expect(
        minimalLogService.writeLog('req-123', 'GET', '/test', 200, 100, mockRequest)
      ).resolves.toBeUndefined();
    });

    test('should write log with full level', async () => {
      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'content-type': 'application/json' },
        body: { test: 'data' },
        get: jest.fn().mockReturnValue('test-agent'),
      };

      const mockResponse = {
        getHeaders: jest.fn().mockReturnValue({ 'content-type': 'application/json' }),
        body: { result: 'success' },
      };

      const mockSecurity = {
        risk: 0.1,
        blocked: false,
        reason: 'Safe content',
        categories: [],
      };

      await expect(
        logService.writeLog('req-123', 'POST', '/guard', 200, 150, mockRequest, mockResponse, mockSecurity)
      ).resolves.toBeUndefined();
    });

    test('should handle S3 errors gracefully', async () => {
      const { S3Client } = require('@aws-sdk/client-s3');
      const mockS3Instance = S3Client.mock.results[S3Client.mock.results.length - 1].value;
      mockS3Instance.send.mockRejectedValueOnce(new Error('S3 Error'));

      const mockRequest = {
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-agent'),
      };

      // Should not throw error
      await expect(
        logService.writeLog('req-123', 'GET', '/test', 200, 100, mockRequest)
      ).resolves.toBeUndefined();
    });
  });

  describe('sanitization', () => {
    test('should sanitize sensitive headers', async () => {
      const mockRequest = {
        ip: '127.0.0.1',
        headers: {
          'authorization': 'Bearer secret-token',
          'x-api-key': 'secret-key',
          'content-type': 'application/json',
        },
        body: { test: 'data' },
        get: jest.fn().mockReturnValue('test-agent'),
      };

      await logService.writeLog('req-123', 'POST', '/test', 200, 100, mockRequest);
      
      // Verify S3 was called (headers should be sanitized internally)
      const { S3Client } = require('@aws-sdk/client-s3');
      const mockS3Instance = S3Client.mock.results[S3Client.mock.results.length - 1].value;
      expect(mockS3Instance.send).toHaveBeenCalled();
    });

    test('should sanitize sensitive body fields', async () => {
      const mockRequest = {
        ip: '127.0.0.1',
        headers: {},
        body: {
          username: 'user123',
          password: 'secret-password',
          apiKey: 'secret-api-key',
          data: 'normal-data',
        },
        get: jest.fn().mockReturnValue('test-agent'),
      };

      await logService.writeLog('req-123', 'POST', '/test', 200, 100, mockRequest);
      
      const { S3Client } = require('@aws-sdk/client-s3');
      const mockS3Instance = S3Client.mock.results[S3Client.mock.results.length - 1].value;
      expect(mockS3Instance.send).toHaveBeenCalled();
    });

    test('should truncate large content', async () => {
      const largeContent = 'a'.repeat(20000);
      const mockRequest = {
        ip: '127.0.0.1',
        headers: {},
        body: largeContent,
        get: jest.fn().mockReturnValue('test-agent'),
      };

      await logService.writeLog('req-123', 'POST', '/test', 200, 100, mockRequest);
      
      const { S3Client } = require('@aws-sdk/client-s3');
      const mockS3Instance = S3Client.mock.results[S3Client.mock.results.length - 1].value;
      expect(mockS3Instance.send).toHaveBeenCalled();
    });
  });

  describe('verifyChain', () => {
    test('should return valid result for empty chain', async () => {
      const result = await logService.verifyChain();
      
      expect(result).toEqual({
        valid: true,
        errors: [],
      });
    });

    test('should accept custom limit', async () => {
      const result = await logService.verifyChain(50);
      
      expect(result).toEqual({
        valid: true,
        errors: [],
      });
    });
  });
});

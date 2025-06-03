import request from 'supertest';
import { app } from '../src/index';

describe('GuardAgent API', () => {
  describe('GET /v1/health', () => {
    test('should return health status', async () => {
      const response = await request(app)
        .get('/v1/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('services');
      expect(response.body.services).toHaveProperty('memory');
    });

    test('should include memory usage information', async () => {
      const response = await request(app)
        .get('/v1/health')
        .expect(200);

      expect(response.body.services.memory).toHaveProperty('used');
      expect(response.body.services.memory).toHaveProperty('total');
      expect(response.body.services.memory).toHaveProperty('percentage');
      expect(typeof response.body.services.memory.percentage).toBe('number');
    });
  });

  describe('POST /v1/guard', () => {
    test('should accept valid guard request', async () => {
      const guardRequest = {
        content: 'Hello, how are you?',
        stage: 'input',
        mode: 'balanced',
        policy: 'default'
      };

      const response = await request(app)
        .post('/v1/guard')
        .send(guardRequest)
        .expect(200);

      expect(response.body).toHaveProperty('risk');
      expect(response.body).toHaveProperty('blocked');
      expect(response.body).toHaveProperty('reason');
      expect(response.body).toHaveProperty('categories');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('processingTime');
      
      expect(typeof response.body.risk).toBe('number');
      expect(typeof response.body.blocked).toBe('boolean');
      expect(typeof response.body.processingTime).toBe('number');
    });

    test('should use default values for optional fields', async () => {
      const guardRequest = {
        content: 'Test content',
        stage: 'input'
      };

      const response = await request(app)
        .post('/v1/guard')
        .send(guardRequest)
        .expect(200);

      expect(response.body).toHaveProperty('risk');
      expect(response.body).toHaveProperty('blocked');
    });

    test('should reject invalid request format', async () => {
      const invalidRequest = {
        content: '',
        stage: 'invalid'
      };

      const response = await request(app)
        .post('/v1/guard')
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid request format');
    });

    test('should handle missing content', async () => {
      const invalidRequest = {
        stage: 'input'
      };

      const response = await request(app)
        .post('/v1/guard')
        .send(invalidRequest)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should reject content that is too long', async () => {
      const longContent = 'a'.repeat(100001);
      const guardRequest = {
        content: longContent,
        stage: 'input'
      };

      const response = await request(app)
        .post('/v1/guard')
        .send(guardRequest)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should accept all valid stages', async () => {
      const stages = ['input', 'tool', 'output'];
      
      for (const stage of stages) {
        const guardRequest = {
          content: 'Test content',
          stage
        };

        const response = await request(app)
          .post('/v1/guard')
          .send(guardRequest)
          .expect(200);

        expect(response.body).toHaveProperty('risk');
      }
    });

    test('should accept all valid modes', async () => {
      const modes = ['permissive', 'balanced', 'strict'];
      
      for (const mode of modes) {
        const guardRequest = {
          content: 'Test content',
          stage: 'input',
          mode
        };

        const response = await request(app)
          .post('/v1/guard')
          .send(guardRequest)
          .expect(200);

        expect(response.body).toHaveProperty('risk');
      }
    });

    test('should accept all valid policies', async () => {
      const policies = ['default', 'highSecurity', 'performance'];
      
      for (const policy of policies) {
        const guardRequest = {
          content: 'Test content',
          stage: 'input',
          policy
        };

        const response = await request(app)
          .post('/v1/guard')
          .send(guardRequest)
          .expect(200);

        expect(response.body).toHaveProperty('risk');
      }
    });
  });

  describe('Error handling', () => {
    test('should return 404 for unknown routes', async () => {
      await request(app)
        .get('/unknown')
        .expect(404);
    });

    test('should handle malformed JSON', async () => {
      await request(app)
        .post('/v1/guard')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);
    });
  });
});

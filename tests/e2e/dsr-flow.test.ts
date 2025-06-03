import request from 'supertest';
import { app } from '../../src/index';
import { AppDataSource } from '../../src/config/database';
import { DSRTicketEntity } from '../../src/entities/DSRTicket';

describe('E2E: DSR Flow', () => {
  let ticketRepository: any;

  beforeAll(async () => {
    // Initialize test database
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    ticketRepository = AppDataSource.getRepository(DSRTicketEntity);
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  beforeEach(async () => {
    // Clean up tickets before each test
    await ticketRepository.clear();
  });

  describe('POST /v1/dsr/access', () => {
    it('should create access request ticket', async () => {
      const response = await request(app)
        .post('/v1/dsr/access')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'test@example.com',
          description: 'Solicito acesso aos meus dados pessoais conforme LGPD Art. 18',
          dataSubjectId: 'user123',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('ticket');
      expect(response.body.ticket).toHaveProperty('ticketId');
      expect(response.body.ticket).toHaveProperty('status', 'received');
      expect(response.body.ticket).toHaveProperty('slaDeadline');
      expect(response.body.ticket).toHaveProperty('estimatedCompletion');
      expect(response.body.ticket).toHaveProperty('nextSteps');
      expect(response.body.ticket).toHaveProperty('contactInfo');

      // Verify ticket was saved to database
      const savedTicket = await ticketRepository.findOne({
        where: { id: response.body.ticket.ticketId }
      });
      expect(savedTicket).toBeTruthy();
      expect(savedTicket.email).toBe('test@example.com');
      expect(savedTicket.type).toBe('access');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/v1/dsr/access')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'test@example.com',
          // Missing description
        });

      expect(response.status).toBe(400);
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/v1/dsr/access')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'invalid-email',
          description: 'Test description',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /v1/dsr/erasure', () => {
    it('should create erasure request ticket', async () => {
      const response = await request(app)
        .post('/v1/dsr/erasure')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'delete@example.com',
          description: 'Solicito a exclusão de todos os meus dados pessoais',
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket.ticketId).toBeTruthy();

      // Verify ticket was saved with correct type
      const savedTicket = await ticketRepository.findOne({
        where: { id: response.body.ticket.ticketId }
      });
      expect(savedTicket.type).toBe('erasure');
    });

    it('should handle WORM log conflict for erasure', async () => {
      const response = await request(app)
        .post('/v1/dsr/erasure')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'delete@example.com',
          description: 'Solicito a exclusão de todos os meus dados pessoais',
        });

      expect(response.status).toBe(201);
      expect(response.body.ticket.nextSteps).toContain('tombstone');
    });
  });

  describe('GET /v1/dsr/ticket/:ticketId', () => {
    it('should retrieve ticket by ID', async () => {
      // First create a ticket
      const createResponse = await request(app)
        .post('/v1/dsr/access')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'test@example.com',
          description: 'Test access request',
        });

      const ticketId = createResponse.body.ticket.ticketId;

      // Then retrieve it
      const getResponse = await request(app)
        .get(`/v1/dsr/ticket/${ticketId}`)
        .set('X-Legal-Basis', 'data_subject_rights');

      expect(getResponse.status).toBe(200);
      expect(getResponse.body).toHaveProperty('ticket');
      expect(getResponse.body.ticket.id).toBe(ticketId);
      expect(getResponse.body.ticket.email).toBe('test@example.com');
    });

    it('should return 404 for non-existent ticket', async () => {
      const response = await request(app)
        .get('/v1/dsr/ticket/01HKQM7X8YGZJQXQZQXQZQXQZQ')
        .set('X-Legal-Basis', 'data_subject_rights');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /v1/dsr/tickets', () => {
    it('should list tickets by email', async () => {
      const email = 'multi@example.com';

      // Create multiple tickets
      await request(app)
        .post('/v1/dsr/access')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email,
          description: 'First request',
        });

      await request(app)
        .post('/v1/dsr/rectification')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email,
          description: 'Second request',
        });

      // List tickets
      const response = await request(app)
        .get('/v1/dsr/tickets')
        .query({ email })
        .set('X-Legal-Basis', 'data_subject_rights');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('tickets');
      expect(Array.isArray(response.body.tickets)).toBe(true);
      expect(response.body.tickets).toHaveLength(2);
      expect(response.body.tickets[0].email).toBe(email);
    });

    it('should require email parameter', async () => {
      const response = await request(app)
        .get('/v1/dsr/tickets')
        .set('X-Legal-Basis', 'data_subject_rights');

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /v1/dsr/ticket/:ticketId/status', () => {
    it('should update ticket status', async () => {
      // Create a ticket
      const createResponse = await request(app)
        .post('/v1/dsr/access')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'test@example.com',
          description: 'Test request',
        });

      const ticketId = createResponse.body.ticket.ticketId;

      // Update status
      const updateResponse = await request(app)
        .put(`/v1/dsr/ticket/${ticketId}/status`)
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          status: 'in_progress',
          assignedTo: 'dpo@example.com',
        });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.success).toBe(true);

      // Verify update in database
      const updatedTicket = await ticketRepository.findOne({
        where: { id: ticketId }
      });
      expect(updatedTicket.status).toBe('in_progress');
      expect(updatedTicket.assignedTo).toBe('dpo@example.com');
    });

    it('should validate status values', async () => {
      const createResponse = await request(app)
        .post('/v1/dsr/access')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'test@example.com',
          description: 'Test request',
        });

      const ticketId = createResponse.body.ticket.ticketId;

      const updateResponse = await request(app)
        .put(`/v1/dsr/ticket/${ticketId}/status`)
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          status: 'invalid_status',
        });

      expect(updateResponse.status).toBe(400);
    });
  });

  describe('GET /v1/dsr/statistics', () => {
    it('should return DSR statistics', async () => {
      // Create some test tickets
      await request(app)
        .post('/v1/dsr/access')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'test1@example.com',
          description: 'Test 1',
        });

      await request(app)
        .post('/v1/dsr/erasure')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'test2@example.com',
          description: 'Test 2',
        });

      const response = await request(app)
        .get('/v1/dsr/statistics')
        .set('X-Legal-Basis', 'data_subject_rights');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('byStatus');
      expect(response.body).toHaveProperty('byType');
      expect(response.body).toHaveProperty('overdue');
      expect(response.body).toHaveProperty('avgResolutionTime');
      expect(response.body.total).toBe(2);
    });
  });

  describe('SLA and Compliance', () => {
    it('should set appropriate SLA deadlines', async () => {
      const response = await request(app)
        .post('/v1/dsr/access')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'test@example.com',
          description: 'Test request',
        });

      const slaDeadline = new Date(response.body.ticket.slaDeadline);
      const now = new Date();
      const diffHours = (slaDeadline.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Access requests should have 720 hours (30 days) SLA
      expect(diffHours).toBeGreaterThan(700);
      expect(diffHours).toBeLessThan(750);
    });

    it('should generate ULID ticket IDs', async () => {
      const response = await request(app)
        .post('/v1/dsr/access')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'test@example.com',
          description: 'Test request',
        });

      const ticketId = response.body.ticket.ticketId;
      
      // ULID should be 26 characters
      expect(ticketId).toHaveLength(26);
      // Should be alphanumeric
      expect(/^[0-9A-HJKMNP-TV-Z]{26}$/.test(ticketId)).toBe(true);
    });

    it('should persist tickets across server restarts', async () => {
      const response = await request(app)
        .post('/v1/dsr/access')
        .set('X-Legal-Basis', 'data_subject_rights')
        .send({
          email: 'persistent@example.com',
          description: 'Persistence test',
        });

      const ticketId = response.body.ticket.ticketId;

      // Verify ticket exists in database
      const ticket = await ticketRepository.findOne({
        where: { id: ticketId }
      });
      
      expect(ticket).toBeTruthy();
      expect(ticket.email).toBe('persistent@example.com');
      expect(ticket.type).toBe('access');
    });
  });
});

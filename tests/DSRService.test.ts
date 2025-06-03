import { DSRService, DSRRequest } from '../src/services/DSRService';

describe('DSRService', () => {
  let dsrService: DSRService;

  beforeEach(() => {
    dsrService = new DSRService();
  });

  describe('createTicket', () => {
    test('should create access ticket successfully', async () => {
      const request: DSRRequest = {
        type: 'access',
        email: 'test@example.com',
        description: 'Solicito acesso aos meus dados pessoais conforme LGPD Art. 18',
        dataSubjectId: 'user123',
      };

      const response = await dsrService.createTicket(request);

      expect(response.ticketId).toBeDefined();
      expect(response.status).toBe('received');
      expect(response.slaDeadline).toBeDefined();
      expect(response.estimatedCompletion).toBeDefined();
      expect(response.nextSteps).toHaveLength(6); // 3 base + 3 específicos para access
      expect(response.contactInfo.dpo).toBeDefined();
    });

    test('should create erasure ticket with correct SLA', async () => {
      const request: DSRRequest = {
        type: 'erasure',
        email: 'test@example.com',
        description: 'Solicito exclusão dos meus dados pessoais',
      };

      const response = await dsrService.createTicket(request);
      
      // Erasure tem SLA de 30 dias (720 horas)
      const slaDate = new Date(response.slaDeadline);
      const now = new Date();
      const diffHours = (slaDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      expect(diffHours).toBeGreaterThan(700);
      expect(diffHours).toBeLessThan(730);
      expect(response.nextSteps).toContain('Avaliaremos se existem bases legais que impedem a exclusão');
    });

    test('should create rectification ticket with short SLA', async () => {
      const request: DSRRequest = {
        type: 'rectification',
        email: 'test@example.com',
        description: 'Preciso corrigir meu nome no sistema',
      };

      const response = await dsrService.createTicket(request);
      
      // Rectification tem SLA de 5 dias (120 horas)
      const slaDate = new Date(response.slaDeadline);
      const now = new Date();
      const diffHours = (slaDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      expect(diffHours).toBeGreaterThan(100);
      expect(diffHours).toBeLessThan(130);
    });

    test('should handle portability request', async () => {
      const request: DSRRequest = {
        type: 'portability',
        email: 'test@example.com',
        description: 'Solicito meus dados em formato portável',
        attachments: ['doc1.pdf', 'doc2.pdf'],
      };

      const response = await dsrService.createTicket(request);
      
      expect(response.ticketId).toBeDefined();
      expect(response.nextSteps).toContain('Os dados serão fornecidos em formato JSON ou CSV');
    });

    test('should handle objection request', async () => {
      const request: DSRRequest = {
        type: 'objection',
        email: 'test@example.com',
        description: 'Me oponho ao tratamento dos meus dados para marketing',
      };

      const response = await dsrService.createTicket(request);
      
      expect(response.nextSteps).toContain('Avaliaremos se há interesses legítimos prevalentes');
    });

    test('should handle complaint with high urgency', async () => {
      const request: DSRRequest = {
        type: 'complaint',
        email: 'test@example.com',
        description: 'Meus dados foram vazados sem autorização',
      };

      const response = await dsrService.createTicket(request);
      
      // Complaint tem SLA de 10 dias (240 horas)
      const slaDate = new Date(response.slaDeadline);
      const now = new Date();
      const diffHours = (slaDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      expect(diffHours).toBeGreaterThan(230);
      expect(diffHours).toBeLessThan(250);
    });
  });

  describe('getTicket', () => {
    test('should retrieve existing ticket', async () => {
      const request: DSRRequest = {
        type: 'access',
        email: 'test@example.com',
        description: 'Test ticket',
      };

      const response = await dsrService.createTicket(request);
      const ticket = await dsrService.getTicket(response.ticketId);

      expect(ticket).toBeDefined();
      expect(ticket!.id).toBe(response.ticketId);
      expect(ticket!.email).toBe('test@example.com');
      expect(ticket!.type).toBe('access');
    });

    test('should return null for non-existent ticket', async () => {
      const ticket = await dsrService.getTicket('non-existent-id');
      expect(ticket).toBeNull();
    });
  });

  describe('getTicketsByEmail', () => {
    test('should return tickets for specific email', async () => {
      const email = 'multi@example.com';
      
      // Criar múltiplos tickets
      await dsrService.createTicket({
        type: 'access',
        email,
        description: 'First ticket',
      });
      
      await dsrService.createTicket({
        type: 'erasure',
        email,
        description: 'Second ticket',
      });
      
      await dsrService.createTicket({
        type: 'access',
        email: 'other@example.com',
        description: 'Other user ticket',
      });

      const tickets = await dsrService.getTicketsByEmail(email);
      
      expect(tickets).toHaveLength(2);
      expect(tickets.every(t => t.email === email)).toBe(true);
    });

    test('should return empty array for email with no tickets', async () => {
      const tickets = await dsrService.getTicketsByEmail('notickets@example.com');
      expect(tickets).toHaveLength(0);
    });
  });

  describe('updateTicketStatus', () => {
    test('should update ticket status successfully', async () => {
      const request: DSRRequest = {
        type: 'access',
        email: 'test@example.com',
        description: 'Test ticket',
      };

      const response = await dsrService.createTicket(request);
      const updated = await dsrService.updateTicketStatus(
        response.ticketId,
        'in_progress',
        'Ticket em análise pela equipe de privacidade',
        'dpo@example.com'
      );

      expect(updated).toBe(true);

      const ticket = await dsrService.getTicket(response.ticketId);
      expect(ticket!.status).toBe('in_progress');
      expect(ticket!.resolution).toBe('Ticket em análise pela equipe de privacidade');
      expect(ticket!.assignedTo).toBe('dpo@example.com');
      expect(ticket!.updatedAt).not.toBe(ticket!.createdAt);
    });

    test('should return false for non-existent ticket', async () => {
      const updated = await dsrService.updateTicketStatus(
        'non-existent-id',
        'completed'
      );

      expect(updated).toBe(false);
    });
  });

  describe('getStatistics', () => {
    test('should return correct statistics', async () => {
      // Criar tickets de diferentes tipos e status
      const accessResponse = await dsrService.createTicket({
        type: 'access',
        email: 'user1@example.com',
        description: 'Access request',
      });

      await dsrService.createTicket({
        type: 'erasure',
        email: 'user2@example.com',
        description: 'Erasure request',
      });

      await dsrService.createTicket({
        type: 'access',
        email: 'user3@example.com',
        description: 'Another access request',
      });

      // Atualizar um ticket para completed
      await dsrService.updateTicketStatus(accessResponse.ticketId, 'completed');

      const stats = dsrService.getStatistics();

      expect(stats.total).toBe(3);
      expect(stats.byType.access).toBe(2);
      expect(stats.byType.erasure).toBe(1);
      expect(stats.byStatus.pending).toBe(2);
      expect(stats.byStatus.completed).toBe(1);
      expect(stats.overdue).toBe(0); // Tickets recém-criados não estão vencidos
    });

    test('should calculate average resolution time correctly', async () => {
      const response = await dsrService.createTicket({
        type: 'access',
        email: 'test@example.com',
        description: 'Test for resolution time',
      });

      // Simular passagem de tempo alterando o createdAt
      const ticket = await dsrService.getTicket(response.ticketId);
      if (ticket) {
        // Simular que o ticket foi criado 2 horas atrás
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        ticket.createdAt = twoHoursAgo.toISOString();
        
        await dsrService.updateTicketStatus(response.ticketId, 'completed');
        
        const stats = dsrService.getStatistics();
        expect(stats.avgResolutionTime).toBeGreaterThan(0);
      }
    });
  });

  describe('SLA calculations', () => {
    test('should calculate correct SLA for each request type', async () => {
      const testCases = [
        { type: 'access' as const, expectedHours: 360 },
        { type: 'rectification' as const, expectedHours: 120 },
        { type: 'erasure' as const, expectedHours: 720 },
        { type: 'portability' as const, expectedHours: 360 },
        { type: 'objection' as const, expectedHours: 360 },
        { type: 'complaint' as const, expectedHours: 240 },
      ];

      for (const testCase of testCases) {
        const response = await dsrService.createTicket({
          type: testCase.type,
          email: 'test@example.com',
          description: `Test ${testCase.type} request`,
        });

        const slaDate = new Date(response.slaDeadline);
        const now = new Date();
        const diffHours = (slaDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        expect(diffHours).toBeGreaterThan(testCase.expectedHours - 5);
        expect(diffHours).toBeLessThan(testCase.expectedHours + 5);
      }
    });
  });

  describe('next steps generation', () => {
    test('should generate appropriate next steps for each request type', async () => {
      const types: DSRRequest['type'][] = ['access', 'erasure', 'rectification', 'portability', 'objection', 'complaint'];

      for (const type of types) {
        const response = await dsrService.createTicket({
          type,
          email: 'test@example.com',
          description: `Test ${type} request`,
        });

        expect(response.nextSteps.length).toBeGreaterThan(3);
        expect(response.nextSteps[0]).toContain('Seu pedido foi recebido');
        
        // Verificar passos específicos por tipo
        switch (type) {
          case 'access':
            expect(response.nextSteps.some(step => step.includes('identidade'))).toBe(true);
            break;
          case 'erasure':
            expect(response.nextSteps.some(step => step.includes('bases legais'))).toBe(true);
            break;
          case 'rectification':
            expect(response.nextSteps.some(step => step.includes('evidências'))).toBe(true);
            break;
          case 'portability':
            expect(response.nextSteps.some(step => step.includes('formato portável'))).toBe(true);
            break;
          case 'objection':
            expect(response.nextSteps.some(step => step.includes('interesses legítimos'))).toBe(true);
            break;
          case 'complaint':
            expect(response.nextSteps.some(step => step.includes('investigaremos'))).toBe(true);
            break;
        }
      }
    });
  });
});

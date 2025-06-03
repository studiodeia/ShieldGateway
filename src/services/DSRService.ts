import { DataSubjectRightsTicket } from '../types/compliance';
import { DSRTicketEntity } from '../entities/DSRTicket';
import { AppDataSource } from '../config/database';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import pino from 'pino';

const logger = pino({
  name: 'core:dsr',
  level: process.env.LOG_LEVEL || 'info',
});

export interface DSRRequest {
  type: 'access' | 'rectification' | 'erasure' | 'portability' | 'objection' | 'complaint';
  dataSubjectId?: string;
  email: string;
  description: string;
  attachments?: string[];
  metadata?: {
    source: string;
    userAgent?: string;
    ip?: string;
  };
}

export interface DSRResponse {
  ticketId: string;
  status: 'received' | 'in_progress' | 'completed' | 'rejected';
  slaDeadline: string;
  estimatedCompletion: string;
  nextSteps: string[];
  contactInfo: {
    dpo: string;
    supportEmail: string;
    phone?: string;
  };
}

export class DSRService {
  private ticketRepository: Repository<DSRTicketEntity>;

  constructor() {
    this.ticketRepository = AppDataSource.getRepository(DSRTicketEntity);
    logger.info('DSR Service initialized with PostgreSQL');
  }
  
  /**
   * Cria um novo ticket de direitos do titular
   */
  async createTicket(request: DSRRequest): Promise<DSRResponse> {
    const ticketId = ulid();
    const now = new Date();

    // Calcular SLA baseado no tipo de solicitação
    const slaHours = this.getSLAHours(request.type);
    const slaDeadline = new Date(now.getTime() + slaHours * 60 * 60 * 1000);

    // Estimativa de conclusão (mais conservadora)
    const estimatedHours = Math.min(slaHours * 0.8, slaHours - 24);
    const estimatedCompletion = new Date(now.getTime() + estimatedHours * 60 * 60 * 1000);

    const ticketEntity = new DSRTicketEntity();
    ticketEntity.id = ticketId;
    ticketEntity.type = request.type;
    ticketEntity.status = 'pending';
    ticketEntity.dataSubjectId = request.dataSubjectId || `email:${request.email}`;
    ticketEntity.email = request.email;
    ticketEntity.description = request.description;
    ticketEntity.slaDeadline = slaDeadline;
    ticketEntity.documents = request.attachments || [];
    ticketEntity.metadata = request.metadata;
    ticketEntity.priority = this.getUrgency(request.type);
    ticketEntity.dpoNotified = false;

    // Salvar no banco de dados
    const savedTicket = await this.ticketRepository.save(ticketEntity);

    // Log para auditoria
    logger.info('DSR ticket created', {
      ticketId,
      type: request.type,
      email: request.email,
      slaDeadline: slaDeadline.toISOString(),
      dataSubjectId: ticketEntity.dataSubjectId,
    });

    // Enviar notificação para DPO (implementar webhook)
    await this.notifyDPO(savedTicket);
    
    const response: DSRResponse = {
      ticketId,
      status: 'received',
      slaDeadline: slaDeadline.toISOString(),
      estimatedCompletion: estimatedCompletion.toISOString(),
      nextSteps: this.getNextSteps(request.type),
      contactInfo: {
        dpo: process.env.DPO_CONTACT || 'dpo@guardagent.io',
        supportEmail: process.env.SUPPORT_EMAIL || 'support@guardagent.io',
        phone: process.env.SUPPORT_PHONE,
      },
    };
    
    return response;
  }
  
  /**
   * Busca ticket por ID
   */
  async getTicket(ticketId: string): Promise<DSRTicketEntity | null> {
    try {
      return await this.ticketRepository.findOne({ where: { id: ticketId } });
    } catch (error) {
      logger.error('Error fetching DSR ticket:', error);
      return null;
    }
  }
  
  /**
   * Lista tickets por email do titular
   */
  async getTicketsByEmail(email: string): Promise<DSRTicketEntity[]> {
    try {
      return await this.ticketRepository.find({
        where: { email },
        order: { createdAt: 'DESC' }
      });
    } catch (error) {
      logger.error('Error fetching DSR tickets by email:', error);
      return [];
    }
  }
  
  /**
   * Atualiza status do ticket
   */
  async updateTicketStatus(
    ticketId: string,
    status: DSRTicketEntity['status'],
    resolution?: string,
    assignedTo?: string
  ): Promise<boolean> {
    try {
      const ticket = await this.ticketRepository.findOne({ where: { id: ticketId } });
      if (!ticket) {
        return false;
      }

      ticket.status = status;
      ticket.updatedAt = new Date();

      if (resolution) {
        ticket.resolution = resolution;
      }

      if (assignedTo) {
        ticket.assignedTo = assignedTo;
      }

      if (status === 'completed') {
        ticket.completedAt = new Date();
      }

      await this.ticketRepository.save(ticket);

      logger.info('DSR ticket updated', {
        ticketId,
        status,
        assignedTo,
        hasResolution: !!resolution,
      });

      return true;
    } catch (error) {
      logger.error('Error updating DSR ticket:', error);
      return false;
    }
  }
  
  /**
   * Calcula SLA em horas baseado no tipo de solicitação
   */
  private getSLAHours(type: DSRRequest['type']): number {
    switch (type) {
      case 'access':
        return 360; // 15 dias úteis (LGPD Art. 19)
      case 'rectification':
        return 120; // 5 dias úteis
      case 'erasure':
        return 720; // 30 dias (LGPD Art. 18)
      case 'portability':
        return 360; // 15 dias úteis
      case 'objection':
        return 360; // 15 dias úteis
      case 'complaint':
        return 240; // 10 dias úteis
      default:
        return 720; // 30 dias (padrão)
    }
  }
  
  /**
   * Define próximos passos baseado no tipo de solicitação
   */
  private getNextSteps(type: DSRRequest['type']): string[] {
    const baseSteps = [
      'Seu pedido foi recebido e registrado em nosso sistema',
      'Nossa equipe de proteção de dados irá analisar sua solicitação',
      'Você receberá atualizações por email sobre o progresso',
    ];
    
    switch (type) {
      case 'access':
        return [
          ...baseSteps,
          'Verificaremos sua identidade antes de fornecer os dados',
          'Os dados serão fornecidos em formato estruturado (JSON)',
          'Caso necessário, solicitaremos documentos adicionais',
        ];
      
      case 'erasure':
        return [
          ...baseSteps,
          'Avaliaremos se existem bases legais que impedem a exclusão',
          'Verificaremos dependências técnicas e legais',
          'A exclusão será confirmada por email quando concluída',
        ];
      
      case 'rectification':
        return [
          ...baseSteps,
          'Solicitaremos evidências das correções necessárias',
          'Validaremos as alterações propostas',
          'As correções serão aplicadas em até 5 dias úteis',
        ];
      
      case 'portability':
        return [
          ...baseSteps,
          'Prepararemos seus dados em formato portável (JSON/CSV)',
          'Os dados serão disponibilizados via download seguro',
          'O link de download expirará em 7 dias',
        ];
      
      case 'objection':
        return [
          ...baseSteps,
          'Avaliaremos as bases legais do tratamento questionado',
          'Analisaremos se há interesses legítimos prevalentes',
          'Informaremos nossa decisão fundamentada',
        ];
      
      case 'complaint':
        return [
          ...baseSteps,
          'Investigaremos a questão relatada',
          'Tomaremos medidas corretivas se necessário',
          'Forneceremos resposta detalhada sobre as ações tomadas',
        ];
      
      default:
        return baseSteps;
    }
  }
  
  /**
   * Notifica DPO sobre novo ticket (webhook/email)
   */
  private async notifyDPO(ticket: DSRTicketEntity): Promise<void> {
    try {
      // Em produção, implementar webhook real ou integração com email
      const notification = {
        ticketId: ticket.id,
        type: ticket.type,
        email: ticket.email,
        description: ticket.description,
        slaDeadline: ticket.slaDeadline.toISOString(),
        urgency: this.getUrgency(ticket.type),
        dashboardUrl: `${process.env.DASHBOARD_URL || 'https://admin.guardagent.io'}/dsr/${ticket.id}`,
      };
      
      logger.info('DPO notification sent', {
        ticketId: ticket.id,
        type: ticket.type,
        urgency: notification.urgency,
      });
      
      // TODO: Implementar envio real de email/webhook
      // await emailService.send({
      //   to: process.env.DPO_CONTACT,
      //   subject: `Novo ticket DSR: ${ticket.type} - ${ticket.id}`,
      //   template: 'dsr-notification',
      //   data: notification
      // });
      
    } catch (error) {
      logger.error('Failed to notify DPO:', error);
      // Não falhar a criação do ticket por falha de notificação
    }
  }
  
  /**
   * Determina urgência baseada no tipo e SLA
   */
  private getUrgency(type: DSRRequest['type']): 'low' | 'medium' | 'high' | 'critical' {
    switch (type) {
      case 'erasure':
      case 'objection':
        return 'high';
      case 'complaint':
        return 'critical';
      case 'rectification':
        return 'medium';
      case 'access':
      case 'portability':
      default:
        return 'low';
    }
  }
  
  /**
   * Estatísticas para dashboard
   */
  async getStatistics() {
    try {
      const tickets = await this.ticketRepository.find();
      const now = new Date();

      const stats = {
        total: tickets.length,
        byStatus: tickets.reduce((acc, ticket) => {
          acc[ticket.status] = (acc[ticket.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byType: tickets.reduce((acc, ticket) => {
          acc[ticket.type] = (acc[ticket.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        overdue: tickets.filter(ticket =>
          ticket.slaDeadline < now && ticket.status !== 'completed'
        ).length,
        avgResolutionTime: this.calculateAvgResolutionTime(tickets),
      };

      return stats;
    } catch (error) {
      logger.error('Error getting DSR statistics:', error);
      return {
        total: 0,
        byStatus: {},
        byType: {},
        overdue: 0,
        avgResolutionTime: 0,
      };
    }
  }
  
  private calculateAvgResolutionTime(tickets: DSRTicketEntity[]): number {
    const completed = tickets.filter(t => t.status === 'completed' && t.completedAt);
    if (completed.length === 0) return 0;

    const totalTime = completed.reduce((sum, ticket) => {
      const created = ticket.createdAt.getTime();
      const completedAt = ticket.completedAt!.getTime();
      return sum + (completedAt - created);
    }, 0);

    return Math.round(totalTime / completed.length / (1000 * 60 * 60)); // horas
  }
}

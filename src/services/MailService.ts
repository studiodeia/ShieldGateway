import sgMail from '@sendgrid/mail';
import pino from 'pino';
import { RiskAssessment } from './RiskEngine';

const logger = pino({
  name: 'core:mail-service',
  level: process.env.LOG_LEVEL || 'info',
});

export interface MailConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  defaultRecipients: string[];
  enabled: boolean;
}

export interface AlertContext {
  type: 'high_risk' | 'vault_sealed' | 'worm_failure' | 'system_error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  requestId?: string;
  tenantId?: string;
  riskAssessment?: RiskAssessment;
  metadata?: Record<string, any>;
  runbookUrl?: string;
  timestamp: Date;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

export class MailService {
  private static instance: MailService;
  private config: MailConfig;
  private initialized: boolean = false;

  private constructor() {
    this.config = {
      apiKey: process.env.SENDGRID_API_KEY || '',
      fromEmail: process.env.MAIL_FROM_EMAIL || 'alerts@guardagent.io',
      fromName: process.env.MAIL_FROM_NAME || 'GuardAgent Security Alerts',
      defaultRecipients: (process.env.MAIL_DEFAULT_RECIPIENTS || '').split(',').filter(Boolean),
      enabled: process.env.MAIL_ENABLED !== 'false',
    };
  }

  static getInstance(): MailService {
    if (!MailService.instance) {
      MailService.instance = new MailService();
    }
    return MailService.instance;
  }

  /**
   * Initialize mail service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.config.enabled) {
      logger.info('Mail service disabled');
      this.initialized = true;
      return;
    }

    if (!this.config.apiKey) {
      logger.warn('SendGrid API key not configured, mail service disabled');
      this.config.enabled = false;
      this.initialized = true;
      return;
    }

    try {
      sgMail.setApiKey(this.config.apiKey);
      
      // Test the configuration
      await this.testConnection();
      
      this.initialized = true;
      logger.info('Mail service initialized successfully', {
        fromEmail: this.config.fromEmail,
        defaultRecipients: this.config.defaultRecipients.length,
      });
    } catch (error) {
      logger.error('Failed to initialize mail service:', error);
      this.config.enabled = false;
      this.initialized = true;
    }
  }

  /**
   * Test mail service connection
   */
  private async testConnection(): Promise<void> {
    // SendGrid doesn't have a direct test endpoint, so we'll just validate the API key format
    if (!this.config.apiKey.startsWith('SG.')) {
      throw new Error('Invalid SendGrid API key format');
    }
  }

  /**
   * Send high-risk alert email
   */
  async sendHighRiskAlert(context: AlertContext, recipients?: string[]): Promise<void> {
    if (!this.config.enabled) {
      logger.debug('Mail service disabled, skipping alert');
      return;
    }

    try {
      const template = this.generateHighRiskTemplate(context);
      const recipientList = recipients || this.config.defaultRecipients;

      if (recipientList.length === 0) {
        logger.warn('No recipients configured for high-risk alert');
        return;
      }

      await this.sendEmail(template, recipientList);

      logger.info('High-risk alert sent successfully', {
        type: context.type,
        severity: context.severity,
        recipients: recipientList.length,
        requestId: context.requestId,
        tenantId: context.tenantId,
      });
    } catch (error) {
      logger.error('Failed to send high-risk alert:', error);
      throw error;
    }
  }

  /**
   * Send system alert email
   */
  async sendSystemAlert(context: AlertContext, recipients?: string[]): Promise<void> {
    if (!this.config.enabled) {
      logger.debug('Mail service disabled, skipping alert');
      return;
    }

    try {
      const template = this.generateSystemAlertTemplate(context);
      const recipientList = recipients || this.config.defaultRecipients;

      if (recipientList.length === 0) {
        logger.warn('No recipients configured for system alert');
        return;
      }

      await this.sendEmail(template, recipientList);

      logger.info('System alert sent successfully', {
        type: context.type,
        severity: context.severity,
        recipients: recipientList.length,
      });
    } catch (error) {
      logger.error('Failed to send system alert:', error);
      throw error;
    }
  }

  /**
   * Send email using SendGrid
   */
  private async sendEmail(template: EmailTemplate, recipients: string[]): Promise<void> {
    const msg = {
      to: recipients,
      from: {
        email: this.config.fromEmail,
        name: this.config.fromName,
      },
      subject: template.subject,
      text: template.text,
      html: template.html,
      categories: ['guardagent-alerts'],
      customArgs: {
        service: 'guardagent-core',
        environment: process.env.NODE_ENV || 'development',
      },
    };

    await sgMail.sendMultiple(msg);
  }

  /**
   * Generate high-risk alert email template
   */
  private generateHighRiskTemplate(context: AlertContext): EmailTemplate {
    const subject = `🚨 GuardAgent High-Risk Alert: ${context.title}`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>GuardAgent Security Alert</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background-color: #dc3545; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .alert-box { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .details { background-color: #f8f9fa; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .footer { background-color: #6c757d; color: white; padding: 15px; text-align: center; font-size: 12px; }
        .button { background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
        .risk-score { font-size: 24px; font-weight: bold; color: #dc3545; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚨 GuardAgent Security Alert</h1>
        <p>High-Risk Activity Detected</p>
    </div>
    
    <div class="content">
        <div class="alert-box">
            <h2>${context.title}</h2>
            <p><strong>Severity:</strong> ${context.severity.toUpperCase()}</p>
            <p><strong>Type:</strong> ${context.type}</p>
            <p><strong>Time:</strong> ${context.timestamp.toISOString()}</p>
        </div>
        
        <h3>Description</h3>
        <p>${context.description}</p>
        
        ${context.riskAssessment ? `
        <div class="details">
            <h3>Risk Assessment Details</h3>
            <p><strong>Risk Score:</strong> <span class="risk-score">${context.riskAssessment.score}/100</span></p>
            <p><strong>Risk Bucket:</strong> ${context.riskAssessment.bucket}</p>
            <p><strong>Should Block:</strong> ${context.riskAssessment.shouldBlock ? 'Yes' : 'No'}</p>
            <p><strong>Factors:</strong></p>
            <ul>
                ${Object.entries(context.riskAssessment.factors).map(([key, value]) => 
                  `<li>${key}: ${(value * 100).toFixed(1)}%</li>`
                ).join('')}
            </ul>
        </div>
        ` : ''}
        
        ${context.requestId ? `
        <div class="details">
            <h3>Request Information</h3>
            <p><strong>Request ID:</strong> ${context.requestId}</p>
            ${context.tenantId ? `<p><strong>Tenant ID:</strong> ${context.tenantId}</p>` : ''}
        </div>
        ` : ''}
        
        ${context.metadata ? `
        <div class="details">
            <h3>Additional Information</h3>
            <pre>${JSON.stringify(context.metadata, null, 2)}</pre>
        </div>
        ` : ''}
        
        ${context.runbookUrl ? `
        <p>
            <a href="${context.runbookUrl}" class="button">View Runbook</a>
        </p>
        ` : ''}
        
        <h3>Recommended Actions</h3>
        <ul>
            <li>Review the request details and risk factors</li>
            <li>Check if this is a legitimate use case or potential attack</li>
            <li>Consider adjusting risk thresholds if needed</li>
            <li>Monitor for similar patterns</li>
        </ul>
    </div>
    
    <div class="footer">
        <p>This alert was generated by GuardAgent Core Security System</p>
        <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
    </div>
</body>
</html>`;

    const text = `
GuardAgent Security Alert: ${context.title}

Severity: ${context.severity.toUpperCase()}
Type: ${context.type}
Time: ${context.timestamp.toISOString()}

Description:
${context.description}

${context.riskAssessment ? `
Risk Assessment:
- Score: ${context.riskAssessment.score}/100
- Bucket: ${context.riskAssessment.bucket}
- Should Block: ${context.riskAssessment.shouldBlock ? 'Yes' : 'No'}
- Factors: ${Object.entries(context.riskAssessment.factors).map(([key, value]) => 
  `${key}: ${(value * 100).toFixed(1)}%`).join(', ')}
` : ''}

${context.requestId ? `Request ID: ${context.requestId}` : ''}
${context.tenantId ? `Tenant ID: ${context.tenantId}` : ''}

${context.runbookUrl ? `Runbook: ${context.runbookUrl}` : ''}

Recommended Actions:
- Review the request details and risk factors
- Check if this is a legitimate use case or potential attack
- Consider adjusting risk thresholds if needed
- Monitor for similar patterns

This alert was generated by GuardAgent Core Security System.
`;

    return { subject, html, text };
  }

  /**
   * Generate system alert email template
   */
  private generateSystemAlertTemplate(context: AlertContext): EmailTemplate {
    const subject = `⚠️ GuardAgent System Alert: ${context.title}`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>GuardAgent System Alert</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background-color: #ffc107; color: #212529; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .alert-box { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .details { background-color: #f8f9fa; padding: 15px; margin: 15px 0; border-radius: 5px; }
        .footer { background-color: #6c757d; color: white; padding: 15px; text-align: center; font-size: 12px; }
        .button { background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 10px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚠️ GuardAgent System Alert</h1>
        <p>System Issue Detected</p>
    </div>
    
    <div class="content">
        <div class="alert-box">
            <h2>${context.title}</h2>
            <p><strong>Severity:</strong> ${context.severity.toUpperCase()}</p>
            <p><strong>Type:</strong> ${context.type}</p>
            <p><strong>Time:</strong> ${context.timestamp.toISOString()}</p>
        </div>
        
        <h3>Description</h3>
        <p>${context.description}</p>
        
        ${context.metadata ? `
        <div class="details">
            <h3>System Information</h3>
            <pre>${JSON.stringify(context.metadata, null, 2)}</pre>
        </div>
        ` : ''}
        
        ${context.runbookUrl ? `
        <p>
            <a href="${context.runbookUrl}" class="button">View Runbook</a>
        </p>
        ` : ''}
    </div>
    
    <div class="footer">
        <p>This alert was generated by GuardAgent Core System Monitor</p>
        <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
    </div>
</body>
</html>`;

    const text = `
GuardAgent System Alert: ${context.title}

Severity: ${context.severity.toUpperCase()}
Type: ${context.type}
Time: ${context.timestamp.toISOString()}

Description:
${context.description}

${context.runbookUrl ? `Runbook: ${context.runbookUrl}` : ''}

This alert was generated by GuardAgent Core System Monitor.
`;

    return { subject, html, text };
  }

  /**
   * Get service configuration (for debugging)
   */
  getConfig(): Omit<MailConfig, 'apiKey'> {
    return {
      fromEmail: this.config.fromEmail,
      fromName: this.config.fromName,
      defaultRecipients: this.config.defaultRecipients,
      enabled: this.config.enabled,
    };
  }
}

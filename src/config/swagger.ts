import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../../package.json';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'GuardAgent Core API',
      version,
      description: 'AI Security Gateway - LGPD/GDPR compliant with WORM logging',
      contact: {
        name: 'GuardAgent Support',
        email: 'support@guardagent.io',
        url: 'https://guardagent.io',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: process.env.API_BASE_URL || 'http://localhost:8080',
        description: 'Development server',
      },
      {
        url: 'https://api.guardagent.io',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error', 'timestamp'],
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Error timestamp',
            },
            details: {
              type: 'object',
              description: 'Additional error details',
            },
          },
        },
        GuardRequest: {
          type: 'object',
          required: ['content', 'stage'],
          properties: {
            content: {
              type: 'string',
              minLength: 1,
              maxLength: 100000,
              description: 'Content to analyze for security threats',
              example: 'Como posso melhorar minha produtividade no trabalho?',
            },
            stage: {
              type: 'string',
              enum: ['input', 'tool', 'output'],
              description: 'Processing stage',
              example: 'input',
            },
            mode: {
              type: 'string',
              enum: ['permissive', 'balanced', 'strict'],
              default: 'balanced',
              description: 'Security mode',
            },
            policy: {
              type: 'string',
              enum: ['default', 'highSecurity', 'performance'],
              default: 'default',
              description: 'Security policy',
            },
            metadata: {
              type: 'object',
              properties: {
                source: {
                  type: 'string',
                  description: 'Source of the request',
                },
                version: {
                  type: 'string',
                  description: 'Client version',
                },
                workflowId: {
                  type: 'string',
                  description: 'Workflow identifier',
                },
              },
            },
          },
        },
        GuardResponse: {
          type: 'object',
          required: ['risk', 'blocked', 'reason', 'categories', 'timestamp', 'processingTime'],
          properties: {
            risk: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Risk score (0-1)',
              example: 0.15,
            },
            blocked: {
              type: 'boolean',
              description: 'Whether content was blocked',
              example: false,
            },
            reason: {
              type: 'string',
              description: 'Reason for the decision',
              example: 'Conteúdo considerado seguro',
            },
            categories: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Detected threat categories',
              example: [],
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Analysis timestamp',
            },
            processingTime: {
              type: 'number',
              description: 'Processing time in milliseconds',
              example: 45,
            },
          },
        },
        DSRRequest: {
          type: 'object',
          required: ['email', 'description'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'Data subject email',
              example: 'user@example.com',
            },
            description: {
              type: 'string',
              minLength: 10,
              maxLength: 2000,
              description: 'Request description',
              example: 'Solicito acesso aos meus dados pessoais conforme LGPD Art. 18',
            },
            dataSubjectId: {
              type: 'string',
              description: 'Data subject identifier',
              example: 'user123',
            },
            attachments: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Attachment URLs or references',
            },
          },
        },
        DSRResponse: {
          type: 'object',
          required: ['ticketId', 'status', 'slaDeadline', 'estimatedCompletion', 'nextSteps', 'contactInfo'],
          properties: {
            ticketId: {
              type: 'string',
              description: 'Unique ticket identifier',
              example: '01HKQM7X8YGZJQXQZQXQZQXQZQ',
            },
            status: {
              type: 'string',
              enum: ['received', 'in_progress', 'completed', 'rejected'],
              description: 'Ticket status',
              example: 'received',
            },
            slaDeadline: {
              type: 'string',
              format: 'date-time',
              description: 'SLA deadline',
            },
            estimatedCompletion: {
              type: 'string',
              format: 'date-time',
              description: 'Estimated completion time',
            },
            nextSteps: {
              type: 'array',
              items: {
                type: 'string',
              },
              description: 'Next steps in the process',
            },
            contactInfo: {
              type: 'object',
              required: ['dpo', 'supportEmail'],
              properties: {
                dpo: {
                  type: 'string',
                  format: 'email',
                  description: 'DPO contact email',
                },
                supportEmail: {
                  type: 'string',
                  format: 'email',
                  description: 'Support email',
                },
                phone: {
                  type: 'string',
                  description: 'Support phone number',
                },
              },
            },
          },
        },
        DPIARequest: {
          type: 'object',
          required: ['processingType', 'dataCategories', 'legalBasis'],
          properties: {
            processingType: {
              type: 'string',
              enum: ['ai_analysis', 'automated_decision', 'profiling', 'monitoring', 'data_transfer'],
              description: 'Type of data processing',
              example: 'ai_analysis',
            },
            dataCategories: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['personal_identifiers', 'contact_data', 'financial_data', 'behavioral_data', 'biometric_data', 'health_data', 'special_categories'],
              },
              description: 'Categories of personal data',
              example: ['personal_identifiers', 'behavioral_data'],
            },
            legalBasis: {
              type: 'string',
              enum: ['consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interest'],
              description: 'Legal basis for processing',
              example: 'legitimate_interest',
            },
            riskLevel: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Initial risk assessment',
              example: 'medium',
            },
          },
        },
        HealthResponse: {
          type: 'object',
          required: ['status', 'timestamp', 'version'],
          properties: {
            status: {
              type: 'string',
              enum: ['healthy', 'degraded', 'unhealthy'],
              description: 'Service health status',
              example: 'healthy',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Health check timestamp',
            },
            version: {
              type: 'string',
              description: 'Service version',
              example: '0.1.0',
            },
            uptime: {
              type: 'number',
              description: 'Uptime in seconds',
              example: 3600,
            },
            checks: {
              type: 'object',
              description: 'Individual health checks',
              properties: {
                database: {
                  type: 'string',
                  enum: ['healthy', 'unhealthy'],
                },
                s3: {
                  type: 'string',
                  enum: ['healthy', 'unhealthy'],
                },
                memory: {
                  type: 'string',
                  enum: ['healthy', 'unhealthy'],
                },
              },
            },
          },
        },
      },
      parameters: {
        RequestId: {
          name: 'X-Request-ID',
          in: 'header',
          description: 'Unique request identifier',
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
        LegalBasis: {
          name: 'X-Legal-Basis',
          in: 'header',
          description: 'Legal basis for processing',
          required: true,
          schema: {
            type: 'string',
            enum: ['consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interest', 'data_subject_rights'],
          },
        },
      },
    },
    tags: [
      {
        name: 'Health',
        description: 'Service health and monitoring',
      },
      {
        name: 'Guard',
        description: 'AI security analysis and threat detection',
      },
      {
        name: 'DSR',
        description: 'Data Subject Rights (LGPD/GDPR)',
      },
      {
        name: 'DPIA',
        description: 'Data Protection Impact Assessment',
      },
      {
        name: 'Metrics',
        description: 'System metrics and monitoring',
      },
    ],
  },
  apis: ['./src/routes/*.ts'], // Path to the API docs
};

export const swaggerSpec = swaggerJsdoc(options);

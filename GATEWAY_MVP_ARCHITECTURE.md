# GuardAgent Gateway MVP - Arquitetura e Configuração

## 🎯 **Visão Geral**

O Gateway MVP é uma versão simplificada do GuardAgent Core, focada em desenvolvedores e PMEs que precisam de proteção básica contra prompt injection e vazamento de PII.

## 🏗️ **Arquitetura de Tiers**

### **Tier FREE (Freemium)**
- 1.000 requests/mês
- Proteção básica prompt injection
- Detecção PII (sem mascaramento)
- Rate limiting: 10 req/min
- Logging básico (7 dias retenção)
- Suporte: Documentação

### **Tier STARTER ($29/mês)**
- 10.000 requests/mês
- Proteção avançada prompt injection
- Mascaramento PII configurável
- Rate limiting: 100 req/min
- Logging: 30 dias retenção
- Hot-reload políticas
- Suporte: Email

### **Tier PRO ($99/mês)**
- 100.000 requests/mês
- Risk scoring 0-1
- Webhooks para alertas
- Rate limiting: 1000 req/min
- Logging: 90 dias retenção
- Métricas avançadas
- Suporte: Priority

## 🔧 **Configuração por Feature Flags**

```typescript
// src/config/tiers.ts
export interface TierConfig {
  name: string;
  monthlyQuota: number;
  rateLimit: {
    requests: number;
    window: number; // seconds
  };
  features: {
    promptInjection: boolean;
    piiDetection: boolean;
    piiMasking: boolean;
    riskScoring: boolean;
    hotReload: boolean;
    webhooks: boolean;
    advancedMetrics: boolean;
  };
  logging: {
    enabled: boolean;
    retentionDays: number;
    s3Storage: boolean;
  };
  support: 'docs' | 'email' | 'priority';
}

export const TIER_CONFIGS: Record<string, TierConfig> = {
  free: {
    name: 'Free',
    monthlyQuota: 1000,
    rateLimit: { requests: 10, window: 60 },
    features: {
      promptInjection: true,
      piiDetection: true,
      piiMasking: false,
      riskScoring: false,
      hotReload: false,
      webhooks: false,
      advancedMetrics: false,
    },
    logging: {
      enabled: true,
      retentionDays: 7,
      s3Storage: false,
    },
    support: 'docs',
  },
  starter: {
    name: 'Starter',
    monthlyQuota: 10000,
    rateLimit: { requests: 100, window: 60 },
    features: {
      promptInjection: true,
      piiDetection: true,
      piiMasking: true,
      riskScoring: false,
      hotReload: true,
      webhooks: false,
      advancedMetrics: false,
    },
    logging: {
      enabled: true,
      retentionDays: 30,
      s3Storage: true,
    },
    support: 'email',
  },
  pro: {
    name: 'Pro',
    monthlyQuota: 100000,
    rateLimit: { requests: 1000, window: 60 },
    features: {
      promptInjection: true,
      piiDetection: true,
      piiMasking: true,
      riskScoring: true,
      hotReload: true,
      webhooks: true,
      advancedMetrics: true,
    },
    logging: {
      enabled: true,
      retentionDays: 90,
      s3Storage: true,
    },
    support: 'priority',
  },
};
```

## 🚀 **Onboarding Self-Service**

### **Landing Page (/start)**
- Cadastro simples (email + senha)
- Geração automática de API Key
- Tutorial interativo
- Playground para testes

### **Dashboard Básico (/dashboard)**
- Uso atual vs quota
- Últimas 10 requisições
- Status da API Key
- Upgrade de tier

### **Documentação (/docs)**
- Quick start guide
- API reference
- Exemplos de código
- SDKs (Python, Node.js, cURL)

## 📊 **Métricas Simplificadas**

### **Básicas (Todos os Tiers)**
- Total requests
- Blocked requests
- Response time p95
- Error rate

### **Avançadas (Pro Tier)**
- Risk score distribution
- PII detection breakdown
- Geographic distribution
- Hourly usage patterns

## 🔌 **Integrações**

### **Webhooks (Starter+)**
```json
{
  "event": "high_risk_detected",
  "timestamp": "2025-01-15T10:30:00Z",
  "request_id": "req_123",
  "risk_score": 0.85,
  "action": "blocked",
  "content_preview": "ignore previous instructions..."
}
```

### **SDKs Planejados**
- Python SDK
- Node.js SDK
- REST API direto
- Webhook examples

## 🛡️ **Segurança Simplificada**

### **Autenticação**
- API Key apenas (sem JWT para MVP)
- Rate limiting por key
- IP allowlisting (Pro tier)

### **Logging**
- Logs estruturados JSON
- Sem WORM/Merkle (para MVP)
- Retenção por tier
- Export via API (Pro tier)

## 🎨 **UI/UX Minimalista**

### **Cores e Branding**
- Primary: #2563eb (blue)
- Success: #16a34a (green)
- Warning: #ea580c (orange)
- Error: #dc2626 (red)

### **Componentes**
- Dashboard cards
- Usage charts
- API key management
- Billing/upgrade flow

## 📈 **Monetização**

### **Freemium Strategy**
- Free tier para atrair desenvolvedores
- Upgrade natural por quota/features
- Self-service billing
- Annual discount (2 meses grátis)

### **Pricing Page**
- Comparação clara de features
- Calculator de uso
- Testimonials
- FAQ sobre limites

## 🔄 **Migration Path para Platform**

### **Upgrade Enterprise**
- Botão "Need Enterprise?" no dashboard
- Lead capture form
- Sales team contact
- Migration assistance

### **Feature Graduation**
- Features testadas no Gateway
- Promovidas para Platform
- Feedback loop contínuo
- A/B testing capabilities

## 📋 **Roadmap Pós-MVP**

### **Q1 2025**
- SDKs oficiais
- More PII types
- Custom rules editor
- Team collaboration

### **Q2 2025**
- Multi-language support
- Advanced analytics
- Compliance reports
- API versioning

### **Q3 2025**
- AI model fine-tuning
- Custom webhooks
- SLA guarantees
- Enterprise migration tools

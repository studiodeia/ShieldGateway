# GuardAgent Gateway MVP - Definição de Escopo

## 🎯 **Visão do Produto**

O GuardAgent Gateway MVP é uma versão simplificada e focada do GuardAgent Core v0.3.1, projetada para desenvolvedores e PMEs que precisam de proteção básica contra prompt injection e vazamento de PII, com onboarding self-service e modelo freemium.

## 📊 **Matriz de Features: Core v0.3.1 → Gateway MVP**

| Feature | Core v0.3.1 | Gateway MVP | Ação | Justificativa |
|---------|-------------|-------------|------|---------------|
| **Prompt Injection Detection** | ✅ Completo | ✅ Mantido | MANTER | Core value proposition |
| **PII Detection/Masking** | ✅ Completo | ✅ Configurável | MANTER | Compliance básica |
| **Rate Limiting** | ✅ Completo | ✅ Por tier | MANTER | Proteção de recursos |
| **API Key Auth** | ✅ Completo | ✅ Simplificado | MANTER | Auth simples para devs |
| **JWT Auth** | ✅ Completo | ✅ Opcional | SIMPLIFICAR | Plus para dashboard |
| **Basic Logging** | ✅ S3 WORM | ✅ S3 simples | SIMPLIFICAR | Sem complexidade WORM |
| **Hot-reload Policies** | ✅ Completo | ✅ Básico | SIMPLIFICAR | Configuração dinâmica |
| **Risk Score 0-100** | ✅ Completo | 🔄 Score 0-1 | SIMPLIFICAR | Mais simples para devs |
| **Risk Headers** | ✅ Completo | 🔄 Opcionais | SIMPLIFICAR | Configurável por tier |
| **Vault/KMS Integration** | ✅ Completo | ❌ Env vars | REMOVER | Complexidade desnecessária |
| **Key Rotation** | ✅ Automático | ❌ Manual | REMOVER | Overhead para MVP |
| **Email Alerts** | ✅ Templates | 🔄 Webhooks | SIMPLIFICAR | User-configurable |
| **DPIA Generation** | ✅ Completo | ❌ Removido | REMOVER | Enterprise feature |
| **Legal Basis Headers** | ✅ Completo | ❌ Removido | REMOVER | Compliance avançada |
| **WORM Logging** | ✅ Merkle-Root | ❌ Removido | REMOVER | Enterprise compliance |
| **Complex RBAC** | ✅ Viewer/Manager | ❌ Owner only | REMOVER | Simplicidade |
| **Tenant Management** | ✅ Completo | 🔄 Self-service | SIMPLIFICAR | Auto-signup |

## ✅ **MANTER - Features Core do Gateway**

### **1. Proteção de Prompt Injection**
- **Escopo**: Motor básico do RiskEngine para PT-BR e EN
- **Configuração**: Políticas YAML editáveis
- **Performance**: <100ms response time
- **Cobertura**: 200+ padrões de injection

### **2. Detecção/Mascaramento de PII**
- **Tipos Suportados**: CPF, CNPJ, email, telefone, cartão de crédito
- **Configuração**: Por tier (detecção free, masking paid)
- **Compliance**: LGPD básica
- **Customização**: Regras por tenant (tier Starter+)

### **3. Rate Limiting**
- **Implementação**: Por IP + API Key
- **Tiers**: Free (10/min), Starter (100/min), Pro (1000/min)
- **Enforcement**: Nginx + application level
- **Headers**: X-RateLimit-* para debugging

### **4. Autenticação API Key**
- **Formato**: `ga_live_` ou `ga_test_` prefix
- **Geração**: Automática no signup
- **Rotação**: Manual via dashboard
- **Scopes**: Básicos (guard:read, guard:write)

### **5. Logging Básico**
- **Storage**: S3 simples (sem WORM)
- **Retenção**: Por tier (7d/30d/90d)
- **Formato**: JSON estruturado
- **Privacy**: Sem conteúdo completo

### **6. Hot-reload de Políticas**
- **Arquivos**: YAML em config/policies/
- **Reload**: <5s sem downtime
- **Validação**: Schema validation
- **Fallback**: Política padrão

## 🔄 **SIMPLIFICAR - Features Adaptadas**

### **1. Risk Score Simplificado**
```typescript
// De: Score 0-100 complexo
interface ComplexRiskAssessment {
  score: number; // 0-100
  bucket: 'low' | 'medium' | 'high';
  factors: Record<string, number>;
  weights: Record<string, number>;
}

// Para: Score 0-1 simples
interface SimpleRiskAssessment {
  score: number; // 0-1
  action: 'ALLOW' | 'BLOCK' | 'REVIEW';
  confidence: number; // 0-1
  reasons: string[];
}
```

### **2. Headers Opcionais**
```typescript
// Tier Free: Headers básicos
X-Risk-Action: ALLOW|BLOCK|REVIEW

// Tier Starter+: Headers detalhados
X-Risk-Score: 0.75
X-Risk-Level: HIGH
X-Risk-Confidence: 0.89
```

### **3. Secrets Management**
```typescript
// De: Vault/KMS complexo
const secret = await vaultService.readSecret('path');

// Para: Environment variables
const secret = process.env.JWT_SECRET;
```

### **4. Alertas via Webhooks**
```typescript
// De: Email templates complexos
await mailService.sendHighRiskAlert(context);

// Para: Webhook configurável
await webhookService.send(userWebhookUrl, {
  event: 'high_risk_detected',
  risk_score: 0.85,
  action: 'blocked'
});
```

## ❌ **REMOVER - Features Enterprise**

### **1. DPIA Generation**
- **Motivo**: Compliance avançada desnecessária para MVP
- **Alternativa**: Documentação de compliance básica
- **Migração**: Feature disponível no upgrade para Platform

### **2. Legal Basis Headers**
- **Motivo**: Complexidade jurídica para devs
- **Alternativa**: Configuração opcional
- **Migração**: Ativação automática no Platform

### **3. WORM Logging com Merkle-Root**
- **Motivo**: Overhead técnico e custo
- **Alternativa**: Logging simples com retenção
- **Migração**: Upgrade automático para compliance

### **4. Complex RBAC**
- **Motivo**: Simplicidade para PMEs
- **Alternativa**: Owner/Admin apenas
- **Migração**: RBAC completo no Platform

### **5. Vault/KMS Integration**
- **Motivo**: Complexidade operacional
- **Alternativa**: Environment variables
- **Migração**: Vault opcional no Platform

## 🏗️ **Arquitetura de Configuração por Tier**

### **Feature Flags System**
```typescript
interface TierConfig {
  name: string;
  monthlyQuota: number;
  features: {
    promptInjection: boolean;
    piiDetection: boolean;
    piiMasking: boolean;
    riskScoring: boolean;
    webhooks: boolean;
    customPolicies: boolean;
    advancedMetrics: boolean;
  };
  rateLimit: { requests: number; window: number };
  logging: { retentionDays: number; includeContent: boolean };
}
```

### **Configuração por Ambiente**
```yaml
# config/gateway.yaml
tiers:
  free:
    monthlyQuota: 1000
    features:
      promptInjection: true
      piiDetection: true
      piiMasking: false
      riskScoring: false
    rateLimit:
      requests: 10
      window: 60
  
  starter:
    monthlyQuota: 10000
    features:
      promptInjection: true
      piiDetection: true
      piiMasking: true
      riskScoring: false
    rateLimit:
      requests: 100
      window: 60
```

## 🚀 **Onboarding Self-Service**

### **Landing Page (/start)**
- **Hero Section**: Value proposition clara
- **Demo Interativo**: Teste de prompt injection
- **Pricing**: Comparação de tiers
- **Signup**: Modal com form simples

### **Signup Flow**
1. **Dados Básicos**: Nome, email, senha, empresa
2. **Tier Selection**: Free (default), Starter, Pro
3. **API Key Generation**: Automática + display único
4. **Dashboard Redirect**: Onboarding tutorial

### **Dashboard Básico**
- **Overview**: Usage, quota, recent requests
- **API Keys**: Management e regeneração
- **Logs**: Últimas 50 requests com filtros
- **Settings**: Webhooks, policies (tier dependent)

## 📈 **Métricas de Sucesso**

### **Técnicas**
- Response time p95 < 100ms
- Uptime > 99.9%
- Signup conversion > 15%
- Free → Paid conversion > 5%

### **Produto**
- 100+ signups na Gramado Summit
- 10+ conversões para Starter
- 5+ leads Enterprise
- NPS > 8.0

### **Negócio**
- $1K+ MRR em 30 dias
- CAC < $50
- LTV/CAC > 3:1
- 50% retention rate (30 dias)

## 🔄 **Migration Path para Platform**

### **Upgrade Triggers**
- Quota exceeded (automático)
- Feature request (manual)
- Compliance needs (sales-led)
- Team growth (usage-based)

### **Feature Graduation**
- Gateway features → Platform features
- User feedback → Product roadmap
- A/B testing → Feature rollout
- Success metrics → Investment decisions

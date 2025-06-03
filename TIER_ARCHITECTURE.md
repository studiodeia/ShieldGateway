# GuardAgent Gateway - Arquitetura de Configuração por Tier

## 🎯 **Visão Geral**

Sistema de feature flags baseado em tiers que permite habilitar/desabilitar funcionalidades dinamicamente baseado no plano do usuário, com configuração flexível e upgrade path claro.

## 🏗️ **Arquitetura do Sistema de Tiers**

### **Componentes Principais**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   TierManager   │    │  FeatureGate    │    │  QuotaManager   │
│                 │    │                 │    │                 │
│ - getTierConfig │    │ - checkFeature  │    │ - checkQuota    │
│ - isEnabled     │    │ - requireTier   │    │ - trackUsage    │
│ - getUpgrade    │    │ - middleware    │    │ - resetQuota    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  TierConfig     │
                    │                 │
                    │ - features      │
                    │ - limits        │
                    │ - pricing       │
                    └─────────────────┘
```

### **Fluxo de Decisão**
```
Request → Auth → TierDetection → FeatureGate → QuotaCheck → Handler
                      │              │            │
                      ▼              ▼            ▼
                 TierConfig    FeatureEnabled?  QuotaOK?
                      │              │            │
                      ▼              ▼            ▼
                 UserTier        Allow/Block   Allow/429
```

## 📊 **Definição de Tiers**

### **Tier FREE**
```yaml
free:
  name: "Free"
  price:
    monthly: 0
    annual: 0
  limits:
    monthlyQuota: 1000
    rateLimit:
      requests: 10
      window: 60  # seconds
    concurrentRequests: 5
  features:
    promptInjection: true
    piiDetection: true
    piiMasking: false
    riskScoring: false
    customPolicies: false
    webhooks: false
    advancedMetrics: false
    prioritySupport: false
  logging:
    enabled: true
    retentionDays: 7
    includeContent: false
    exportEnabled: false
  support:
    type: "documentation"
    sla: "best-effort"
```

### **Tier STARTER**
```yaml
starter:
  name: "Starter"
  price:
    monthly: 29
    annual: 290  # 2 months free
  limits:
    monthlyQuota: 10000
    rateLimit:
      requests: 100
      window: 60
    concurrentRequests: 20
  features:
    promptInjection: true
    piiDetection: true
    piiMasking: true
    riskScoring: false
    customPolicies: true
    webhooks: false
    advancedMetrics: false
    prioritySupport: false
  logging:
    enabled: true
    retentionDays: 30
    includeContent: false
    exportEnabled: true
  support:
    type: "email"
    sla: "48h"
```

### **Tier PRO**
```yaml
pro:
  name: "Pro"
  price:
    monthly: 99
    annual: 990  # 2 months free
  limits:
    monthlyQuota: 100000
    rateLimit:
      requests: 1000
      window: 60
    concurrentRequests: 100
  features:
    promptInjection: true
    piiDetection: true
    piiMasking: true
    riskScoring: true
    customPolicies: true
    webhooks: true
    advancedMetrics: true
    prioritySupport: true
  logging:
    enabled: true
    retentionDays: 90
    includeContent: true
    exportEnabled: true
  support:
    type: "priority"
    sla: "4h"
```

## 🔧 **Implementação Técnica**

### **1. TierManager Service**
```typescript
export class TierManager {
  private static instance: TierManager;
  private tierConfigs: Map<string, TierConfig>;

  static getInstance(): TierManager {
    if (!TierManager.instance) {
      TierManager.instance = new TierManager();
    }
    return TierManager.instance;
  }

  getTierConfig(tierName: string): TierConfig {
    return this.tierConfigs.get(tierName) || this.tierConfigs.get('free')!;
  }

  isFeatureEnabled(tierName: string, feature: string): boolean {
    const config = this.getTierConfig(tierName);
    return config.features[feature] || false;
  }

  getUpgradeSuggestion(tierName: string, usage: number): string | null {
    const config = this.getTierConfig(tierName);
    const usagePercent = (usage / config.limits.monthlyQuota) * 100;
    
    if (usagePercent > 80) {
      if (tierName === 'free') return 'starter';
      if (tierName === 'starter') return 'pro';
      if (tierName === 'pro') return 'enterprise';
    }
    
    return null;
  }
}
```

### **2. FeatureGate Middleware**
```typescript
export class FeatureGateMiddleware {
  requireFeature(feature: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      const userTier = this.getUserTier(req);
      const tierManager = TierManager.getInstance();
      
      if (!tierManager.isFeatureEnabled(userTier, feature)) {
        return res.status(402).json({
          error: 'Feature not available',
          feature,
          currentTier: userTier,
          upgradeRequired: this.getRequiredTier(feature),
          upgradeUrl: '/pricing'
        });
      }
      
      next();
    };
  }

  checkQuota() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const userTier = this.getUserTier(req);
      const currentUsage = await this.getCurrentUsage(req);
      const tierManager = TierManager.getInstance();
      const config = tierManager.getTierConfig(userTier);
      
      if (currentUsage >= config.limits.monthlyQuota) {
        return res.status(429).json({
          error: 'Quota exceeded',
          currentUsage,
          quota: config.limits.monthlyQuota,
          resetDate: this.getQuotaResetDate(),
          upgradeUrl: '/pricing'
        });
      }
      
      next();
    };
  }
}
```

### **3. Database Schema**
```sql
-- Tenant table with tier information
ALTER TABLE tenants ADD COLUMN tier VARCHAR(20) DEFAULT 'free';
ALTER TABLE tenants ADD COLUMN current_usage INTEGER DEFAULT 0;
ALTER TABLE tenants ADD COLUMN quota_reset_at TIMESTAMP;
ALTER TABLE tenants ADD COLUMN tier_updated_at TIMESTAMP;

-- Usage tracking table
CREATE TABLE usage_tracking (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  date DATE NOT NULL,
  requests_count INTEGER DEFAULT 0,
  blocked_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

-- Feature usage table
CREATE TABLE feature_usage (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  feature_name VARCHAR(50) NOT NULL,
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, feature_name)
);
```

## 🚦 **Feature Flags por Endpoint**

### **API Endpoints**
```typescript
// Basic endpoints (all tiers)
app.post('/v1/guard', 
  auth, 
  featureGate.checkQuota(), 
  guardHandler
);

// PII masking (starter+)
app.post('/v1/guard', 
  auth, 
  featureGate.requireFeature('piiMasking'),
  featureGate.checkQuota(), 
  guardWithMaskingHandler
);

// Risk scoring (pro+)
app.post('/v1/guard', 
  auth, 
  featureGate.requireFeature('riskScoring'),
  featureGate.checkQuota(), 
  guardWithRiskHandler
);

// Webhooks (pro+)
app.post('/v1/webhooks', 
  auth, 
  featureGate.requireFeature('webhooks'),
  webhookHandler
);

// Advanced metrics (pro+)
app.get('/v1/analytics', 
  auth, 
  featureGate.requireFeature('advancedMetrics'),
  analyticsHandler
);
```

### **Dashboard Features**
```typescript
// Basic dashboard (all tiers)
app.get('/dashboard/overview', auth, overviewHandler);

// Custom policies (starter+)
app.get('/dashboard/policies', 
  auth, 
  featureGate.requireFeature('customPolicies'),
  policiesHandler
);

// Advanced analytics (pro+)
app.get('/dashboard/analytics', 
  auth, 
  featureGate.requireFeature('advancedMetrics'),
  advancedAnalyticsHandler
);
```

## 📈 **Upgrade Flow**

### **Automatic Upgrade Suggestions**
```typescript
export class UpgradeManager {
  checkUpgradeOpportunities(tenant: Tenant): UpgradeOpportunity[] {
    const opportunities: UpgradeOpportunity[] = [];
    
    // Quota-based upgrade
    if (tenant.currentUsage / tenant.monthlyQuota > 0.8) {
      opportunities.push({
        type: 'quota',
        reason: 'Approaching monthly quota limit',
        suggestedTier: this.getNextTier(tenant.tier),
        urgency: 'high'
      });
    }
    
    // Feature-based upgrade
    const blockedFeatures = this.getBlockedFeatureAttempts(tenant.id);
    if (blockedFeatures.length > 0) {
      opportunities.push({
        type: 'feature',
        reason: `Attempted to use: ${blockedFeatures.join(', ')}`,
        suggestedTier: this.getTierForFeatures(blockedFeatures),
        urgency: 'medium'
      });
    }
    
    return opportunities;
  }
}
```

### **Upgrade UI Components**
```typescript
// Dashboard upgrade banner
const UpgradeBanner = ({ tier, usage, quota }) => {
  const usagePercent = (usage / quota) * 100;
  
  if (usagePercent > 80) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <ExclamationIcon className="h-5 w-5 text-yellow-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              Approaching quota limit
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>You've used {usagePercent.toFixed(1)}% of your monthly quota.</p>
            </div>
            <div className="mt-4">
              <div className="-mx-2 -my-1.5 flex">
                <button className="bg-yellow-50 px-2 py-1.5 rounded-md text-sm font-medium text-yellow-800 hover:bg-yellow-100">
                  Upgrade to {getNextTier(tier)}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
};
```

## 🔄 **Configuration Management**

### **Environment-based Configuration**
```yaml
# config/tiers/development.yaml
environment: development
tiers:
  free:
    limits:
      monthlyQuota: 10000  # Higher for testing
      rateLimit:
        requests: 100      # More permissive
  
# config/tiers/production.yaml
environment: production
tiers:
  free:
    limits:
      monthlyQuota: 1000   # Production limits
      rateLimit:
        requests: 10       # Strict limits
```

### **Feature Flag Override**
```typescript
// Admin override for testing
export class AdminOverride {
  enableFeatureForTenant(tenantId: string, feature: string, duration: number) {
    // Temporary feature enable for testing/demos
    redis.setex(`override:${tenantId}:${feature}`, duration, 'true');
  }
  
  checkOverride(tenantId: string, feature: string): boolean {
    return redis.exists(`override:${tenantId}:${feature}`);
  }
}
```

## 📊 **Monitoring e Analytics**

### **Tier Usage Metrics**
```typescript
// Track tier distribution
const tierDistribution = await db.query(`
  SELECT tier, COUNT(*) as count 
  FROM tenants 
  GROUP BY tier
`);

// Track feature usage by tier
const featureUsage = await db.query(`
  SELECT t.tier, fu.feature_name, SUM(fu.usage_count) as total_usage
  FROM tenants t
  JOIN feature_usage fu ON t.id = fu.tenant_id
  GROUP BY t.tier, fu.feature_name
`);

// Track upgrade conversion
const upgradeConversion = await db.query(`
  SELECT 
    COUNT(*) FILTER (WHERE tier_updated_at > NOW() - INTERVAL '30 days') as upgrades,
    COUNT(*) as total_tenants
  FROM tenants
`);
```

### **Business Intelligence**
- Revenue per tier
- Feature adoption rates
- Upgrade conversion funnel
- Churn analysis by tier
- Support ticket volume by tier

## 🎯 **Success Metrics**

### **Technical Metrics**
- Feature flag response time < 1ms
- Quota check response time < 5ms
- 99.9% uptime for tier system
- Zero false positives in feature blocking

### **Business Metrics**
- Free → Starter conversion > 5%
- Starter → Pro conversion > 10%
- Monthly churn rate < 5%
- Average revenue per user growth

### **User Experience Metrics**
- Upgrade flow completion > 80%
- Feature discovery rate > 30%
- Support ticket reduction with self-service
- User satisfaction score > 8.5

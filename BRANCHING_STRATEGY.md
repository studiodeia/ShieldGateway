# GuardAgent - Estratégia de Branching

## 🎯 **Visão Geral**

Estratégia de branching para suportar duas linhas de produto derivadas do GuardAgent Core v0.3.1:
- **GuardAgent Gateway (MVP)**: Versão simplificada para desenvolvedores e PMEs
- **GuardAgent AI Governance Platform**: Base enterprise para governança completa

## 🌳 **Estrutura de Branches**

```
main (AI Governance Platform)
├── v0.3.1-platform-base (tag)
├── feature/governance-modules
├── feature/enterprise-rbac
└── feature/compliance-automation

feature/gateway-mvp (Gateway MVP)
├── v0.3.1-gateway-base (tag)
├── feature/gateway-ui
├── feature/self-service
└── feature/tier-system
```

## 📋 **Política de Branching**

### **Main Branch (AI Governance Platform)**
- **Propósito**: Evolução para plataforma enterprise completa
- **Base**: GuardAgent Core v0.3.1 com todas as features
- **Evolução**: Novos módulos de governança, RBAC avançado, compliance
- **Deploy**: Ambiente enterprise, clientes high-value

### **Feature/Gateway-MVP Branch**
- **Propósito**: Versão simplificada para mercado dev/PME
- **Base**: GuardAgent Core v0.3.1 com features selecionadas
- **Evolução**: UI self-service, tiers, billing, SDKs
- **Deploy**: SaaS público, freemium model

## 🔄 **Política de Merge**

### **Fluxo Principal**
```bash
# Desenvolvimento Gateway MVP
feature/gateway-mvp ← feature/gateway-ui
feature/gateway-mvp ← feature/self-service
feature/gateway-mvp ← feature/tier-system

# Desenvolvimento Platform
main ← feature/governance-modules
main ← feature/enterprise-rbac
main ← feature/compliance-automation
```

### **Cherry-picking de Fixes**
```bash
# Fixes de segurança: main → gateway-mvp
git checkout feature/gateway-mvp
git cherry-pick <security-fix-commit>

# Fixes de performance: main → gateway-mvp
git checkout feature/gateway-mvp
git cherry-pick <performance-fix-commit>

# Features específicas: NÃO fazer merge automático
# Avaliar caso a caso se faz sentido para o Gateway MVP
```

### **Critérios para Cherry-picking**

**✅ SEMPRE Cherry-pick:**
- Fixes de segurança críticos
- Correções de vulnerabilidades
- Patches de performance
- Bug fixes em features compartilhadas

**⚠️ AVALIAR Cherry-pick:**
- Novas features de segurança
- Melhorias de performance
- Refatorações de código compartilhado
- Atualizações de dependências

**❌ NUNCA Cherry-pick:**
- Features enterprise específicas
- Módulos de governança avançada
- RBAC complexo
- Integrações Vault/KMS avançadas

## 🏷️ **Estratégia de Tags**

### **Tags Base**
- `v0.3.1-platform-base`: Ponto de partida para Platform
- `v0.3.1-gateway-base`: Ponto de partida para Gateway MVP

### **Tags de Release**

**Gateway MVP:**
- `v1.0.0-gateway-alpha`: Primeira versão interna
- `v1.0.0-gateway-beta`: Versão para testes
- `v1.0.0-gateway`: Release para Gramado Summit

**AI Governance Platform:**
- `v0.4.0-platform-alpha`: Primeira versão com novos módulos
- `v0.4.0-platform-beta`: Versão para design partners
- `v0.4.0-platform`: Release enterprise

## 🚀 **Comandos de Setup**

### **Criar Branch Gateway MVP**
```bash
# A partir do Core v0.3.1
git checkout main
git tag v0.3.1-platform-base

# Criar branch do Gateway
git checkout -b feature/gateway-mvp
git tag v0.3.1-gateway-base

# Push das branches e tags
git push origin feature/gateway-mvp
git push origin v0.3.1-platform-base
git push origin v0.3.1-gateway-base
```

### **Workflow de Desenvolvimento**

**Para Gateway MVP:**
```bash
# Feature branch a partir do gateway-mvp
git checkout feature/gateway-mvp
git checkout -b feature/gateway-ui
# ... desenvolvimento
git checkout feature/gateway-mvp
git merge feature/gateway-ui
```

**Para Platform:**
```bash
# Feature branch a partir do main
git checkout main
git checkout -b feature/governance-modules
# ... desenvolvimento
git checkout main
git merge feature/governance-modules
```

### **Cherry-pick de Fixes**
```bash
# Identificar commit de fix na main
git log --oneline main

# Cherry-pick para gateway-mvp
git checkout feature/gateway-mvp
git cherry-pick <commit-hash>

# Resolver conflitos se necessário
git add .
git commit

# Push do fix
git push origin feature/gateway-mvp
```

## 📊 **Monitoramento de Divergência**

### **Métricas a Acompanhar**
- Número de commits únicos em cada branch
- Tamanho das diferenças de código
- Features compartilhadas vs específicas
- Tempo de cherry-pick de fixes

### **Alertas de Divergência**
- Quando gateway-mvp está >50 commits atrás em fixes
- Quando main está >100 commits à frente
- Quando cherry-pick falha por conflitos

## 🔧 **Ferramentas de Suporte**

### **Scripts de Automação**
```bash
# scripts/sync-security-fixes.sh
#!/bin/bash
# Automatiza cherry-pick de commits marcados como security

# scripts/check-divergence.sh  
#!/bin/bash
# Verifica divergência entre branches

# scripts/release-gateway.sh
#!/bin/bash
# Automatiza processo de release do Gateway
```

### **CI/CD Pipeline**
- **Gateway MVP**: Deploy automático para staging
- **Platform**: Deploy manual para ambientes enterprise
- **Shared**: Testes de segurança em ambas as branches

## 📋 **Responsabilidades**

### **Gateway MVP Team**
- Manter feature/gateway-mvp atualizada
- Implementar features de self-service
- Monitorar cherry-picks necessários
- Release para mercado dev/PME

### **Platform Team**
- Manter main branch estável
- Desenvolver módulos enterprise
- Coordenar fixes de segurança
- Release para clientes enterprise

### **DevOps Team**
- Automatizar cherry-pick de fixes
- Monitorar divergência de branches
- Manter CI/CD para ambas as linhas
- Coordenar releases

## 🎯 **Objetivos de Sucesso**

### **Curto Prazo (Sprint G-0 a G-4)**
- ✅ Branches criadas e configuradas
- ✅ Primeiro release Gateway MVP
- ✅ Zero conflitos em cherry-picks
- ✅ CI/CD funcionando para ambas

### **Médio Prazo (3-6 meses)**
- Gateway MVP com 1000+ usuários
- Platform com 5+ clientes enterprise
- <24h para cherry-pick de fixes críticos
- 95% de uptime em ambas as linhas

### **Longo Prazo (6-12 meses)**
- Possível convergência de features maduras
- Gateway como entry point para Platform
- Estratégia de upsell bem definida
- Codebase otimizada para ambas as linhas

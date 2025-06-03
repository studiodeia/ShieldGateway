# Sprint 2 Implementation - "Operacional"

## Overview

Sprint 2 implements IAM Lite & RBAC, async logging with queues, and enhanced observability for GuardAgent Core. This sprint focuses on operational readiness with authentication, authorization, and production-grade monitoring.

## 🎯 Sprint 2 Goals

- **IAM Lite & RBAC**: API key management with JWT tokens and role-based access control
- **Async Logging**: Queue-based WORM logging with back-pressure and DLQ
- **Enhanced Observability**: Prometheus metrics, Grafana dashboards, and Alertmanager

## 📋 Implementation Status

### ✅ Completed Features

#### Épico 2.1 - IAM Lite & RBAC (32h)

**US-IAM-01: API Keys & JWT (24h)**
- ✅ Database entities for tenants, API keys, and roles
- ✅ JWT service with JWKS support (RS256)
- ✅ Authentication middleware supporting API keys and JWT
- ✅ CLI for tenant and API key management
- ✅ JWKS endpoint at `/.well-known/jwks.json`

**US-RBAC-01: Role-based Access Control (8h)**
- ✅ Two roles: `viewer` (read-only) and `manager` (full access)
- ✅ Permission-based route protection
- ✅ Role determination based on API key scopes
- ✅ Middleware for role enforcement

#### Épico 2.2 - Async Logging & Resiliência (24h)

**US-LOG-01: Async Logging with Queue (18h)**
- ✅ BullMQ integration with Redis
- ✅ Async log worker with exponential retry
- ✅ SQS Dead Letter Queue for failed jobs
- ✅ Back-pressure handling and queue metrics

**US-LOG-02: Hash-chain Ordering (6h)**
- ✅ Sequential hash-chain maintenance in worker
- ✅ Previous hash tracking for integrity
- ✅ Chain continuity across restarts

#### Épico 2.3 - Observabilidade (14h)

**US-OBS-01: Enhanced Metrics & Monitoring (14h)**
- ✅ Extended Prometheus metrics
- ✅ Grafana dashboard configuration
- ✅ Alertmanager rules for SLA monitoring
- ✅ Queue health monitoring

## 🔧 Technical Implementation

### Authentication Flow

1. **API Key Exchange**: Client sends API key in `Authorization: ApiKey <key>` header
2. **JWT Generation**: Server validates API key and returns JWT in `X-JWT-Token` header
3. **JWT Usage**: Client can use JWT in subsequent requests: `Authorization: Bearer <jwt>`
4. **Role Assignment**: Roles determined automatically based on API key scopes

### Queue Architecture

```
Request → RequestLogger → Queue → LogWorker → S3 WORM
                     ↓
                   Fallback → Direct S3 (if queue fails)
                     ↓
                   DLQ → SQS (if all retries fail)
```

### Metrics & Monitoring

- **Latency**: p95 < 300ms @ 150 RPS (Sprint 2 SLA)
- **Authentication**: Failure rate monitoring
- **Queue**: Backlog and failure rate tracking
- **Security**: Blocking rate and event monitoring

## 🚀 Usage Examples

### 1. Create Tenant and API Key

```bash
# Create tenant
npm run cli:keys tenant:create \
  --name "Acme Corp" \
  --email "admin@acme.com" \
  --organization "Acme Corporation"

# Create API key with manager permissions
npm run cli:keys keys:create \
  --tenant <tenant-id> \
  --name "Production API Key" \
  --scopes "guard:read,guard:write,dsr:read,dsr:write"
```

### 2. Use API Key

```bash
# Direct API key usage
curl -X POST http://localhost:8080/v1/guard \
  -H "Authorization: ApiKey ga_test_<your-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test content for analysis",
    "stage": "input",
    "mode": "balanced"
  }'

# JWT usage (get JWT from X-JWT-Token header)
curl -X POST http://localhost:8080/v1/guard \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Test content for analysis",
    "stage": "input"
  }'
```

### 3. Monitor Queue Health

```bash
# Check queue metrics in health endpoint
curl http://localhost:8080/v1/health

# View Prometheus metrics
curl http://localhost:8080/metrics | grep guardagent_queue
```

## 📊 Monitoring & Alerting

### Key Metrics

- `guardagent_request_latency_ms`: Request latency histogram
- `guardagent_auth_failures_total`: Authentication failure counter
- `guardagent_queue_size`: Queue size by status
- `guardagent_api_key_usage_total`: API key usage tracking
- `guardagent_blocking_rate`: Security blocking rate

### Critical Alerts

- **High Latency**: p95 > 300ms for 2+ minutes
- **Queue Backlog**: >1000 waiting jobs for 5+ minutes
- **Auth Failures**: >10 failures/sec for 2+ minutes
- **WORM Log Failures**: >1 failure/sec for 1+ minute

## 🔒 Security Features

### API Key Security

- SHA-256 hashed storage (never store plaintext)
- Automatic expiration support
- Usage tracking and IP logging
- Scope-based access control

### JWT Security

- RS256 signing with rotating keys
- Short TTL (1 hour default)
- JWKS endpoint for public key distribution
- Automatic expiration handling

## 🏗️ Architecture Changes

### New Components

- **AuthService**: API key and JWT management
- **QueueService**: Async job processing with BullMQ
- **LogWorker**: Background WORM log processing
- **RBAC Middleware**: Role-based access control

### Database Schema

- **tenants**: Tenant management with quotas
- **api_keys**: Hashed API keys with scopes
- **roles**: Permission-based role definitions

## 🧪 Testing

### Load Testing

```bash
# Test at Sprint 2 SLA: 150 RPS
npm run perf:test-local

# Expected: p95 < 300ms
```

### Integration Testing

```bash
# Run full test suite
npm test

# Test with coverage (target: 72%+)
npm run test:coverage
```

## 📈 Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| p95 Latency @ 150 RPS | ≤ 300ms | ✅ |
| Auth Failures/day | 0 in staging | ✅ |
| Test Coverage | ≥ 72% | ✅ |
| Queue Processing | <150ms | ✅ |

## 🔄 Next Steps (Sprint 3)

- Plugin system architecture
- Advanced security policies
- Multi-tenant isolation
- Performance optimization to 80% coverage

## 📚 Documentation

- [API Documentation](http://localhost:8080/docs)
- [Grafana Dashboard](config/grafana-dashboard.json)
- [Alerting Rules](config/prometheus-rules.yml)
- [CLI Reference](src/cli/keys.ts)

---

**Sprint 2 Status**: ✅ **COMPLETE** - Ready for design-partner pilots with full authentication, async logging, and monitoring.

# GuardAgent Gateway - API Reference

## 🌐 **Base URL**

```
Production: https://api.guardagent.io
Staging: https://staging-api.guardagent.io
```

## 🔐 **Authentication**

All API requests require authentication using your API key in the Authorization header:

```
Authorization: ApiKey ga_live_your_key_here
```

### **API Key Format**
- **Live keys**: `ga_live_` prefix for production
- **Test keys**: `ga_test_` prefix for development

---

## 🛡️ **Core Endpoints**

### **POST /v1/guard**

Analyze content for security threats including prompt injection and PII.

#### **Request**

```http
POST /v1/guard
Authorization: ApiKey ga_live_your_key_here
Content-Type: application/json

{
  "content": "string (required, max 50KB)",
  "stage": "input|output (default: input)",
  "mode": "strict|balanced|permissive (default: balanced)",
  "format": "json|simple|detailed (default: json)",
  "policy": "string (optional)",
  "metadata": "object (optional)"
}
```

#### **Parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `content` | string | Yes | Content to analyze (max 50,000 characters) |
| `stage` | enum | No | Analysis stage: `input` (user input) or `output` (AI response) |
| `mode` | enum | No | Detection sensitivity: `strict`, `balanced`, `permissive` |
| `format` | enum | No | Response format: `json`, `simple`, `detailed` |
| `policy` | string | No | Custom policy name (Starter+ tiers) |
| `metadata` | object | No | Additional context for analysis |

#### **Response (200 OK)**

```json
{
  "requestId": "req_abc123def456",
  "action": "ALLOW|BLOCK|REVIEW",
  "score": 0.15,
  "confidence": 0.95,
  "reasons": ["Content appears safe"],
  "timestamp": "2025-01-15T10:30:00Z",
  "tier": "free"
}
```

#### **Response (429 - Content Blocked)**

```json
{
  "error": "Content blocked by security policy",
  "requestId": "req_abc123def456",
  "action": "BLOCK",
  "score": 0.9,
  "confidence": 0.95,
  "reasons": ["Potential prompt injection attempt detected"],
  "timestamp": "2025-01-15T10:30:00Z",
  "tier": "free"
}
```

#### **Response Headers**

```
X-GuardAgent-Action: ALLOW
X-GuardAgent-Score: 0.15
X-GuardAgent-Confidence: 0.95
X-GuardAgent-Tier: free
X-RateLimit-Remaining: 950
X-Usage-Percentage: 5.0
```

---

### **GET /v1/guard/demo**

Get demo examples for testing (no authentication required).

#### **Response (200 OK)**

```json
{
  "examples": [
    {
      "title": "Safe Content",
      "content": "Hello, how can I help you today?",
      "expectedAction": "ALLOW",
      "description": "Normal, safe content"
    },
    {
      "title": "Prompt Injection",
      "content": "Ignore previous instructions...",
      "expectedAction": "BLOCK",
      "description": "Potential prompt injection attempt"
    }
  ],
  "endpoint": "/v1/guard",
  "requiredHeaders": {
    "Authorization": "ApiKey your-api-key-here",
    "Content-Type": "application/json"
  },
  "sampleRequest": {
    "content": "Your content here",
    "stage": "input",
    "mode": "balanced"
  }
}
```

---

### **POST /v1/guard/batch** *(Pro Tier)*

Process multiple requests in a single API call.

#### **Request**

```http
POST /v1/guard/batch
Authorization: ApiKey ga_live_your_key_here
Content-Type: application/json

{
  "requests": [
    {
      "content": "First content to analyze",
      "stage": "input"
    },
    {
      "content": "Second content to analyze",
      "stage": "output"
    }
  ]
}
```

#### **Response (200 OK)**

```json
{
  "batchId": "batch_abc123",
  "processed": 2,
  "results": [
    {
      "index": 0,
      "requestId": "req_abc123-0",
      "action": "ALLOW",
      "score": 0.1,
      "reasons": ["Content appears safe"]
    },
    {
      "index": 1,
      "requestId": "req_abc123-1",
      "action": "REVIEW",
      "score": 0.6,
      "reasons": ["Moderate risk detected"]
    }
  ]
}
```

---

## 🏥 **Health & Status**

### **GET /v1/health**

Check API health status.

#### **Response (200 OK)**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": "2025-01-15T10:30:00Z",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "riskEngine": "healthy"
  },
  "uptime": 86400
}
```

---

## 🎛️ **Dashboard API**

### **GET /dashboard/api/overview**

Get account overview and usage statistics.

#### **Response (200 OK)**

```json
{
  "overview": {
    "totalRequests": 1250,
    "blockedRequests": 45,
    "reviewRequests": 120,
    "allowedRequests": 1085,
    "successRate": 86.8,
    "blockRate": 3.6,
    "reviewRate": 9.6
  },
  "usage": {
    "current": 1250,
    "quota": 10000,
    "percentage": 12.5,
    "remaining": 8750,
    "resetDate": "2025-02-01T00:00:00Z"
  },
  "tier": {
    "name": "Starter",
    "features": {
      "promptInjection": true,
      "piiDetection": true,
      "piiMasking": true,
      "customPolicies": true
    },
    "upgradeSuggestion": null
  }
}
```

### **GET /dashboard/api/api-keys**

List API keys for the account.

#### **Response (200 OK)**

```json
{
  "apiKeys": [
    {
      "keyId": "ga_live_abc123",
      "name": "Production Key",
      "scopes": ["guard:read", "guard:write"],
      "isActive": true,
      "lastUsed": "2025-01-15T09:30:00Z",
      "createdAt": "2025-01-01T10:00:00Z",
      "expiresAt": "2026-01-01T10:00:00Z",
      "rateLimit": 100
    }
  ]
}
```

### **POST /dashboard/api/api-keys**

Generate a new API key.

#### **Request**

```json
{
  "name": "My New API Key"
}
```

#### **Response (201 Created)**

```json
{
  "message": "API key generated successfully",
  "apiKey": {
    "keyId": "ga_live_def456",
    "key": "ga_live_def456ghi789...",
    "name": "My New API Key",
    "scopes": ["guard:read", "guard:write"],
    "expiresAt": "2026-01-15T10:30:00Z",
    "rateLimit": 100
  },
  "warning": "Save this key securely - it will not be shown again"
}
```

### **DELETE /dashboard/api/api-keys/:keyId**

Revoke an API key.

#### **Response (200 OK)**

```json
{
  "message": "API key revoked successfully",
  "keyId": "ga_live_def456"
}
```

---

## 📊 **Response Formats**

### **JSON Format** (Default)

```json
{
  "requestId": "req_abc123",
  "action": "ALLOW",
  "score": 0.15,
  "confidence": 0.95,
  "reasons": ["Content appears safe"],
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### **Simple Format**

```json
{
  "action": "ALLOW",
  "score": 0.15,
  "safe": true
}
```

### **Detailed Format** *(Starter+ Tiers)*

```json
{
  "requestId": "req_abc123",
  "action": "ALLOW",
  "score": 0.15,
  "confidence": 0.95,
  "reasons": ["Content appears safe"],
  "timestamp": "2025-01-15T10:30:00Z",
  "tier": "starter",
  "details": {
    "factors": {
      "injection": 0.1,
      "pii": 0.0,
      "content": 0.05
    },
    "originalScore": 15,
    "bucket": "low",
    "piiDetected": false,
    "piiTypes": []
  }
}
```

---

## ⚠️ **Error Responses**

### **400 Bad Request**

```json
{
  "error": "Invalid request format",
  "details": [
    {
      "field": "content",
      "message": "Content is required"
    }
  ],
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### **401 Unauthorized**

```json
{
  "error": "Invalid API key",
  "code": "UNAUTHORIZED",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### **402 Payment Required**

```json
{
  "error": "Feature not available",
  "code": "FEATURE_NOT_AVAILABLE",
  "feature": "customPolicies",
  "currentTier": "free",
  "upgradeRequired": "starter",
  "upgradeUrl": "/pricing",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### **429 Too Many Requests**

```json
{
  "error": "Quota exceeded",
  "code": "QUOTA_EXCEEDED",
  "currentUsage": 1000,
  "quota": 1000,
  "resetDate": "2025-02-01T00:00:00Z",
  "upgradeRequired": "starter",
  "upgradeUrl": "/pricing",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### **500 Internal Server Error**

```json
{
  "error": "Internal server error",
  "requestId": "req_abc123",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

## 🔄 **Rate Limits**

Rate limits vary by tier:

| Tier | Requests/Minute | Monthly Quota |
|------|-----------------|---------------|
| Free | 10 | 1,000 |
| Starter | 100 | 10,000 |
| Pro | 1,000 | 100,000 |

Rate limit headers are included in all responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642694400
X-Usage-Current: 1250
X-Usage-Percentage: 12.5
```

---

## 🌍 **SDKs and Libraries**

### **Official SDKs**

- **Python**: `pip install guardagent-python`
- **Node.js**: `npm install guardagent-js`
- **PHP**: `composer require guardagent/php-sdk`

### **Community SDKs**

- **Ruby**: `gem install guardagent-ruby`
- **Go**: `go get github.com/guardagent/go-sdk`
- **Java**: Maven/Gradle available

---

## 📝 **Changelog**

### **v1.0.0** (Current)
- Initial Gateway MVP release
- Core protection features
- Tier-based feature flags
- Self-service onboarding

---

## 🆘 **Support**

- **Documentation**: [docs.guardagent.io](https://docs.guardagent.io)
- **API Status**: [status.guardagent.io](https://status.guardagent.io)
- **Support**: [support@guardagent.io](mailto:support@guardagent.io)
- **Issues**: [github.com/guardagent/gateway](https://github.com/guardagent/gateway)

import { Request, Response, NextFunction } from 'express';
import { register, Histogram, Counter, Gauge } from 'prom-client';

// Métricas Prometheus
export const requestLatencyHistogram = new Histogram({
  name: 'guardagent_request_latency_ms',
  help: 'Request latency in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [1, 5, 10, 25, 50, 100, 150, 250, 500, 1000, 2500, 5000],
});

export const requestCounter = new Counter({
  name: 'guardagent_requests_total',
  help: 'Total number of requests',
  labelNames: ['method', 'route', 'status_code'],
});

export const activeRequestsGauge = new Gauge({
  name: 'guardagent_active_requests',
  help: 'Number of active requests',
});

export const securityEventsCounter = new Counter({
  name: 'guardagent_security_events_total',
  help: 'Total number of security events',
  labelNames: ['type', 'blocked', 'risk_level'],
});

export const wormLogsCounter = new Counter({
  name: 'guardagent_worm_logs_total',
  help: 'Total number of WORM logs written',
  labelNames: ['status'],
});

export const authFailuresCounter = new Counter({
  name: 'guardagent_auth_failures_total',
  help: 'Total number of authentication failures',
  labelNames: ['type', 'reason'],
});

export const queueMetricsGauge = new Gauge({
  name: 'guardagent_queue_size',
  help: 'Current queue size by status',
  labelNames: ['queue', 'status'],
});

export const apiKeyUsageCounter = new Counter({
  name: 'guardagent_api_key_usage_total',
  help: 'Total API key usage',
  labelNames: ['tenant_id', 'key_prefix'],
});

export const blockingRateGauge = new Gauge({
  name: 'guardagent_blocking_rate',
  help: 'Current blocking rate percentage',
});

export const logWorkerProcessingHistogram = new Histogram({
  name: 'guardagent_log_worker_processing_duration_ms',
  help: 'Log worker processing duration in milliseconds',
  buckets: [10, 25, 50, 100, 150, 250, 500, 1000, 2500, 5000],
});

export const hashChainMetricsGauge = new Gauge({
  name: 'guardagent_hash_chain_sequence_number',
  help: 'Current hash chain sequence number',
});

// Registrar métricas
register.registerMetric(requestLatencyHistogram);
register.registerMetric(requestCounter);
register.registerMetric(activeRequestsGauge);
register.registerMetric(securityEventsCounter);
register.registerMetric(wormLogsCounter);
register.registerMetric(authFailuresCounter);
register.registerMetric(queueMetricsGauge);
register.registerMetric(apiKeyUsageCounter);
register.registerMetric(blockingRateGauge);
register.registerMetric(logWorkerProcessingHistogram);
register.registerMetric(hashChainMetricsGauge);

/**
 * Middleware para coletar métricas de requisições
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();
  
  // Incrementar gauge de requisições ativas
  activeRequestsGauge.inc();
  
  // Override do res.end para capturar métricas
  const originalEnd = res.end.bind(res);
  res.end = function(chunk?: any, encoding?: any, cb?: any) {
    const duration = Date.now() - startTime;
    const route = req.route?.path || req.path;
    
    // Registrar métricas
    requestLatencyHistogram
      .labels(req.method, route, res.statusCode.toString())
      .observe(duration);
    
    requestCounter
      .labels(req.method, route, res.statusCode.toString())
      .inc();
    
    // Decrementar gauge de requisições ativas
    activeRequestsGauge.dec();
    
    return originalEnd(chunk, encoding, cb);
  };
  
  next();
}

/**
 * Endpoint para expor métricas Prometheus
 */
export async function metricsHandler(req: Request, res: Response) {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    res.status(500).end(error);
  }
}

/**
 * Registra evento de segurança nas métricas
 */
export function recordSecurityEvent(type: string, blocked: boolean, risk: number) {
  const riskLevel = risk >= 0.8 ? 'high' : risk >= 0.5 ? 'medium' : 'low';
  securityEventsCounter
    .labels(type, blocked.toString(), riskLevel)
    .inc();
}

/**
 * Registra log WORM nas métricas
 */
export function recordWormLog(status: 'success' | 'error') {
  wormLogsCounter
    .labels(status)
    .inc();
}

/**
 * Registra falha de autenticação
 */
export function recordAuthFailure(type: 'api_key' | 'jwt' | 'missing', reason: string) {
  authFailuresCounter
    .labels(type, reason)
    .inc();
}

/**
 * Atualiza métricas da fila
 */
export function updateQueueMetrics(queueName: string, metrics: { waiting: number; active: number; completed: number; failed: number; delayed: number }) {
  queueMetricsGauge.labels(queueName, 'waiting').set(metrics.waiting);
  queueMetricsGauge.labels(queueName, 'active').set(metrics.active);
  queueMetricsGauge.labels(queueName, 'completed').set(metrics.completed);
  queueMetricsGauge.labels(queueName, 'failed').set(metrics.failed);
  queueMetricsGauge.labels(queueName, 'delayed').set(metrics.delayed);
}

/**
 * Registra uso de API key
 */
export function recordApiKeyUsage(tenantId: string, keyPrefix: string) {
  apiKeyUsageCounter
    .labels(tenantId, keyPrefix)
    .inc();
}

/**
 * Atualiza taxa de bloqueio
 */
export function updateBlockingRate(rate: number) {
  blockingRateGauge.set(rate);
}

/**
 * Registra tempo de processamento do worker de log
 */
export function recordLogWorkerProcessingTime(durationMs: number) {
  logWorkerProcessingHistogram.observe(durationMs);
}

/**
 * Atualiza número de sequência da hash chain
 */
export function updateHashChainSequence(sequenceNumber: number) {
  hashChainMetricsGauge.set(sequenceNumber);
}

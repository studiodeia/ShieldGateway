import { Logger } from './logger';

/**
 * Interface para configuração do mecanismo de retry
 */
export interface RetryConfig {
  /** Número máximo de tentativas (padrão: 3) */
  maxRetries: number;
  /** Atraso base em ms (padrão: 300ms) */
  baseDelay: number;
  /** Atraso máximo em ms (padrão: 30000ms = 30s) */
  maxDelay: number;
  /** Variação aleatória (0-1) para evitar sincronização (padrão: 0.25) */
  jitter: number;
  /** Habilitar logs detalhados das tentativas (padrão: true) */
  verbose: boolean;
}

/**
 * Configuração padrão para retry
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 300,
  maxDelay: 30000, // 30 segundos
  jitter: 0.25,
  verbose: true
};

/**
 * Enum para status da operação de retry
 */
export enum RetryStatus {
  /** Operação bem-sucedida sem retry */
  SUCCESS = 'success',
  /** Sucesso após uma ou mais tentativas de retry */
  SUCCESS_AFTER_RETRY = 'success_after_retry',
  /** Falha após esgotar todas as tentativas */
  MAX_RETRIES_EXCEEDED = 'max_retries_exceeded',
  /** Erro não-retryable detectado */
  NON_RETRYABLE_ERROR = 'non_retryable_error'
}

/**
 * Interface para o resultado de uma operação com retry
 */
export interface RetryResult<T> {
  /** Status final da operação */
  status: RetryStatus;
  /** Dados retornados pela operação (se bem-sucedida) */
  data?: T;
  /** Erro retornado (se falhou) */
  error?: Error;
  /** Número de tentativas realizadas */
  attempts: number;
  /** Tempo total gasto em ms */
  totalTimeMs: number;
}

/**
 * Tipo para função que determina se um erro é retryable
 */
export type RetryableErrorDetector = (error: any) => boolean;

/**
 * Verifica se um erro HTTP é retryable baseado no código de status
 * @param error Erro a ser verificado
 * @returns true se o erro for retryable
 */
export function isRetryableHttpError(error: any): boolean {
  // Erro sem resposta ou código de status
  if (!error.response || !error.response.status) {
    // Erros de rede provavelmente são retryable
    return true;
  }
  
  const status = error.response.status;
  
  // Considera retryable:
  // - 408 Request Timeout
  // - 429 Too Many Requests
  // - 5xx Server Errors
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

/**
 * Calcula o tempo de espera para a próxima tentativa usando backoff exponencial com jitter
 * @param attempt Número da tentativa atual (1-indexed)
 * @param config Configuração de retry
 * @returns Tempo de espera em ms
 */
export function calculateBackoff(attempt: number, config: RetryConfig): number {
  // Fórmula de backoff exponencial: baseDelay * 2^(attempt-1)
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt - 1);
  
  // Aplica o valor máximo de delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
  
  // Aplica jitter para evitar sincronização ("thundering herd")
  // Valor final entre [cappedDelay * (1 - jitter), cappedDelay * (1 + jitter)]
  const jitterMultiplier = 1 + (Math.random() * 2 - 1) * config.jitter;
  
  return Math.max(0, Math.floor(cappedDelay * jitterMultiplier));
}

/**
 * Executa uma operação com mecanismo de retry e backoff exponencial
 * @param operation Função assíncrona que será executada com retry
 * @param isRetryable Função para determinar se um erro é retryable
 * @param config Configuração de retry
 * @returns Resultado da operação com informações de retry
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  isRetryable: RetryableErrorDetector = isRetryableHttpError,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  // Mescla configuração padrão com a fornecida
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  
  let attempts = 0;
  let lastError: Error | undefined;
  const startTime = Date.now();
  
  while (attempts < fullConfig.maxRetries + 1) {
    attempts++;
    
    try {
      if (fullConfig.verbose && attempts > 1) {
        Logger.debug(`Tentativa ${attempts}/${fullConfig.maxRetries + 1} para operação`, {
          attempt: attempts,
          maxAttempts: fullConfig.maxRetries + 1
        });
      }
      
      // Executa a operação
      const result = await operation();
      
      // Calcula o tempo total decorrido
      const totalTimeMs = Date.now() - startTime;
      
      // Operação bem-sucedida
      const status = attempts === 1
        ? RetryStatus.SUCCESS
        : RetryStatus.SUCCESS_AFTER_RETRY;
        
      if (fullConfig.verbose && status === RetryStatus.SUCCESS_AFTER_RETRY) {
        Logger.info(`Operação bem-sucedida após ${attempts} tentativas (${totalTimeMs}ms)`);
      }
      
      return {
        status,
        data: result,
        attempts,
        totalTimeMs
      };
    } catch (error) {
      lastError = error as Error;
      
      // Verifica se atingiu o número máximo de tentativas
      if (attempts > fullConfig.maxRetries) {
        break;
      }
      
      // Verifica se o erro é retryable
      if (!isRetryable(error)) {
        if (fullConfig.verbose) {
          Logger.warn(`Erro não-retryable detectado`, { error });
        }
        
        const totalTimeMs = Date.now() - startTime;
        return {
          status: RetryStatus.NON_RETRYABLE_ERROR,
          error: lastError,
          attempts,
          totalTimeMs
        };
      }
      
      // Calcula o tempo de backoff
      const delayMs = calculateBackoff(attempts, fullConfig);
      
      if (fullConfig.verbose) {
        Logger.debug(`Falha na tentativa ${attempts}/${fullConfig.maxRetries + 1}. Aguardando ${delayMs}ms antes da próxima tentativa.`, {
          attempt: attempts,
          maxAttempts: fullConfig.maxRetries + 1,
          delayMs,
          error
        });
      }
      
      // Aguarda o tempo de backoff
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // Se chegou aqui, todas as tentativas falharam
  const totalTimeMs = Date.now() - startTime;
  
  if (fullConfig.verbose) {
    Logger.error(`Falha após ${attempts} tentativas (${totalTimeMs}ms)`, { error: lastError });
  }
  
  return {
    status: RetryStatus.MAX_RETRIES_EXCEEDED,
    error: lastError,
    attempts,
    totalTimeMs
  };
} 

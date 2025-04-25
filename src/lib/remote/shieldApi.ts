import axios, { AxiosError } from 'axios';
import { GuardResult, ShieldConfig } from '../guards/types';

const API_BASE_URL = 'https://api.shieldgateway.io/v1';
const DEFAULT_TIMEOUT = 3000; // 3 segundos para timeout
const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 300; // ms

interface RemoteVerdict {
  risk?: number;
  blocked?: boolean;
  reason?: string;
}

// Configuração para failOpen/failClosed
export interface FailoverConfig {
  failMode: 'open' | 'closed'; // open = permitir em caso de falha, closed = bloquear em caso de falha
  retryCount: number;
  logOnly: boolean; // se true, apenas loga erros sem bloquear
}

/**
 * Implementa lógica de exponential backoff para retries
 * @param attempt Número da tentativa atual
 * @returns Tempo de espera em ms
 */
function getBackoffTime(attempt: number): number {
  return INITIAL_BACKOFF * Math.pow(2, attempt - 1);
}

/**
 * Delay para backoff
 * @param ms Milissegundos para aguardar
 */
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verifica se o erro pode ser retentado
 * @param error Erro da chamada axios
 */
function isRetryableError(error: AxiosError): boolean {
  // Errors 5xx são problemas no servidor e podem ser retentados
  // Errors 429 (rate limit) também podem ser retentados após backoff
  if (!error.response) return true; // Timeout ou erro de rede
  
  const statusCode = error.response.status;
  return statusCode >= 500 || statusCode === 429 || statusCode === 408;
}

/**
 * Verifica um texto com a ShieldAPI remota com retry e backoff
 * @param content Conteúdo a ser verificado
 * @param stage Estágio da verificação (input, tool, output)
 * @param config Configuração de segurança
 * @param apiKey Chave API para autenticação
 * @param failoverConfig Configuração de comportamento em caso de falha
 * @returns Veredicto da verificação remota
 */
export async function checkRemoteShieldAPI(
  content: string,
  stage: 'input' | 'tool' | 'output',
  config: ShieldConfig,
  apiKey: string,
  failoverConfig: FailoverConfig = { failMode: 'open', retryCount: MAX_RETRIES, logOnly: false }
): Promise<RemoteVerdict> {
  // Se não tiver API key, retorna um resultado vazio
  if (!apiKey) {
    return {};
  }

  // Número máximo de tentativas
  const maxRetries = failoverConfig.retryCount || MAX_RETRIES;
  let attempt = 1;
  let lastError: Error | null = null;

  // Preparar dados para envio
  const requestData = {
    content,
    stage,
    mode: config.mode,
    policy: config.policy,
    metadata: {
      source: 'n8n-plugin',
      version: '0.1.0',
    },
  };

  // Configurar cabeçalhos de autenticação
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'X-Shield-Client': 'n8n-plugin',
  };

  while (attempt <= maxRetries) {
    try {
      // Enviar requisição para a API remota com timeout
      const response = await axios.post(
        `${API_BASE_URL}/check`,
        requestData,
        {
          headers,
          timeout: DEFAULT_TIMEOUT,
        }
      );

      // Processar resposta
      if (response.status === 200 && response.data) {
        return {
          risk: response.data.risk,
          blocked: response.data.blocked,
          reason: response.data.reason,
        };
      }

      // Se chegou aqui, o status não é 200 mas também não lançou erro
      // Tentamos novamente
      console.warn(`Resposta inesperada do ShieldAPI (${response.status}), tentativa ${attempt}/${maxRetries}`);
      
    } catch (error) {
      lastError = error as Error;
      const axiosError = error as AxiosError;
      
      // Log detalhado do erro
      console.error(`Erro ao conectar com ShieldAPI (tentativa ${attempt}/${maxRetries}):`, 
        axiosError.response?.status || 'Sem resposta',
        axiosError.message);
      
      // Decidir se tentamos novamente
      if (attempt < maxRetries && isRetryableError(axiosError)) {
        const backoffTime = getBackoffTime(attempt);
        console.info(`Aguardando ${backoffTime}ms antes da próxima tentativa...`);
        await delay(backoffTime);
        attempt++;
        continue;
      }
      
      // Erro não retentável (401, 403) ou máximo de tentativas atingido
      break;
    }
    
    // Se chegou aqui sem sucesso nem exception, incrementa a tentativa
    attempt++;
  }

  // Todas as tentativas falharam
  console.error('Todas as tentativas de conexão com ShieldAPI falharam.');
  
  // Aplicar política de failover
  if (failoverConfig.failMode === 'closed' && !failoverConfig.logOnly) {
    return {
      risk: 1.0,
      blocked: true,
      reason: `Falha ao conectar com ShieldAPI após ${maxRetries} tentativas. Bloqueando conforme configuração de failover.`,
    };
  }
  
  // Default é fail-open (apenas loga e continua)
  return {};
}

/**
 * Verifica status da conexão com a ShieldAPI
 * @param apiKey Chave API para autenticação
 * @returns Status da conexão
 */
export async function checkShieldAPIStatus(apiKey: string): Promise<boolean> {
  try {
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'X-Shield-Client': 'n8n-plugin',
    };

    const response = await axios.get(
      `${API_BASE_URL}/status`,
      {
        headers,
        timeout: DEFAULT_TIMEOUT,
      }
    );

    return response.status === 200 && response.data?.status === 'ok';
  } catch (error) {
    console.error('Erro ao verificar status da ShieldAPI:', error);
    return false;
  }
} 
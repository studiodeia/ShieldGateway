import { GuardResult, OutputGuardConfig, PolicyType } from './types';
import { Logger } from '../../utils/logger';

/**
 * Configuração padrão para análise de saída do sistema
 */
export const DEFAULT_OUTPUT_GUARD_CONFIG: OutputGuardConfig = {
  maxLength: 50000,
  sensitivePatterns: [
    // Tokens e chaves
    /api[_-]?key\s*[:=]\s*([a-zA-Z0-9]{16,})/i,
    /auth[_-]?token\s*[:=]\s*([a-zA-Z0-9]{16,})/i,
    /password\s*[:=]\s*\S+/i,
    /secret\s*[:=]\s*\S+/i,
    
    // Informações pessoais
    /cpf\s*[:=]?\s*\d{3}\.?\d{3}\.?\d{3}\-?\d{2}/i,
    /cnpj\s*[:=]?\s*\d{2}\.?\d{3}\.?\d{3}\/?\d{4}\-?\d{2}/i,
    /telefone\s*[:=]?\s*\(\d{2}\)\s*9?\d{4}\-?\d{4}/i,
    /e-?mail\s*[:=]?\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i
  ],
  blockedContentPatterns: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
    /eval\s*\(/i,
    /javascript\s*:/i
  ],
  redactedText: "[CONTEÚDO REDATADO]"
};

// Configurações específicas por política
const HIGH_SECURITY_CONFIG: OutputGuardConfig = {
  ...DEFAULT_OUTPUT_GUARD_CONFIG,
  maxLength: 25000,
  sensitivePatterns: [
    ...DEFAULT_OUTPUT_GUARD_CONFIG.sensitivePatterns,
    // Padrões adicionais para política de alta segurança
    /senha\s*[:=]?\s*\S+/i,
    /token\s*[:=]?\s*\S+/i,
    /chave\s*[:=]?\s*\S+/i,
    /credencial\s*[:=]?\s*\S+/i,
    /rg\s*[:=]?\s*\d{1,2}\.?\d{3}\.?\d{3}\-?[\dxX]/i,
    /cartão\s*[:=]?\s*\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/i,
  ],
  blockedContentPatterns: [
    ...DEFAULT_OUTPUT_GUARD_CONFIG.blockedContentPatterns,
    // Padrões adicionais para política de alta segurança
    /function\s*\(/i,
    /require\s*\(/i,
    /import\s+.*from/i,
    /fetch\s*\(/i,
    /XMLHttpRequest/i,
  ]
};

const PERFORMANCE_CONFIG: OutputGuardConfig = {
  ...DEFAULT_OUTPUT_GUARD_CONFIG,
  maxLength: 100000,
  // Reduzir o número de verificações para melhor desempenho
  sensitivePatterns: [
    /api[_-]?key\s*[:=]\s*([a-zA-Z0-9]{16,})/i,
    /auth[_-]?token\s*[:=]\s*([a-zA-Z0-9]{16,})/i,
    /password\s*[:=]\s*\S+/i,
    /cpf\s*[:=]?\s*\d{3}\.?\d{3}\.?\d{3}\-?\d{2}/i,
  ],
  blockedContentPatterns: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
    /eval\s*\(/i,
  ]
};

/**
 * Mapeia a política de segurança para a configuração correspondente
 */
function getConfigForPolicy(policy: PolicyType): OutputGuardConfig {
  switch (policy) {
    case 'highSecurity':
      return HIGH_SECURITY_CONFIG;
    case 'performance':
      return PERFORMANCE_CONFIG;
    case 'default':
    default:
      return DEFAULT_OUTPUT_GUARD_CONFIG;
  }
}

/**
 * Analisa e filtra a saída do sistema para detectar e remover conteúdo sensível
 * @param output Saída a ser analisada
 * @param config Configuração de análise
 * @returns Resultado da análise e saída filtrada
 */
export function analyzeOutput(
  output: string,
  config: OutputGuardConfig = DEFAULT_OUTPUT_GUARD_CONFIG
): { guardResult: GuardResult; filteredOutput: string } {
  let risk = 0;
  let blocked = false;
  let reason = '';
  let filteredOutput = output;

  // Verifica tamanho máximo
  if (output.length > config.maxLength) {
    Logger.warn(`Saída excede o tamanho máximo: ${output.length} > ${config.maxLength}`);
    risk = 0.6;
    reason = `Saída excede o tamanho máximo permitido (${config.maxLength} caracteres)`;
    filteredOutput = output.substring(0, config.maxLength) + "... [Truncado]";
  }

  // Verifica e redacta padrões sensíveis
  for (const pattern of config.sensitivePatterns) {
    if (pattern.test(output)) {
      Logger.warn(`Padrão sensível detectado na saída: ${pattern}`);
      risk = Math.max(risk, 0.7);
      
      if (!reason) {
        reason = 'Informação sensível detectada na saída';
      }
      
      // Redacta as informações sensíveis
      filteredOutput = filteredOutput.replace(pattern, config.redactedText);
    }
  }

  // Verifica padrões de conteúdo bloqueado
  for (const pattern of config.blockedContentPatterns) {
    if (pattern.test(output)) {
      Logger.warn(`Conteúdo bloqueado detectado na saída: ${pattern}`);
      risk = 0.9;
      blocked = true;
      reason = 'Conteúdo potencialmente malicioso detectado na saída';
      
      // Redacta conteúdo bloqueado
      filteredOutput = filteredOutput.replace(pattern, config.redactedText);
    }
  }

  // Análise geral de risco
  const urlCount = (output.match(/(https?:\/\/[^\s]+)/g) || []).length;
  if (urlCount > 5) {
    Logger.info(`Grande número de URLs detectado na saída: ${urlCount}`);
    risk = Math.max(risk, 0.4);
    if (!reason) {
      reason = 'Grande número de URLs na saída';
    }
  }

  // Detecção de código executável
  const codeBlockCount = (output.match(/```[\s\S]*?```/g) || []).length;
  if (codeBlockCount > 3) {
    Logger.info(`Grande número de blocos de código detectado: ${codeBlockCount}`);
    risk = Math.max(risk, 0.3);
    if (!reason) {
      reason = 'Grande quantidade de código na saída';
    }
  }

  // Se não foi identificado nenhum problema
  if (!reason) {
    reason = 'Saída segura';
  }

  Logger.debug(`Análise de saída concluída com risco: ${risk}`);

  return {
    guardResult: {
      risk,
      blocked,
      reason
    },
    filteredOutput
  };
}

/**
 * Guard principal para verificação de saída. Aplica políticas de segurança e retorna o resultado
 * @param output Texto de saída a ser analisado
 * @param policy Política de segurança a ser aplicada
 * @returns Resultado da análise de segurança
 */
export async function outputGuard(
  output: string, 
  policy: PolicyType = 'default'
): Promise<GuardResult> {
  try {
    Logger.info(`Iniciando análise de saída (política: ${policy})`);
    
    // Obter configuração com base na política
    const config = getConfigForPolicy(policy);
    
    // Analisar a saída
    const { guardResult, filteredOutput } = analyzeOutput(output, config);
    
    // Registrar o resultado
    Logger.info(
      `Análise de saída concluída: risco=${guardResult.risk.toFixed(2)}, bloqueado=${guardResult.blocked}`
    );
    
    return guardResult;
  } catch (error) {
    Logger.error(`Erro ao analisar saída: ${(error as Error).message}`);
    
    // Em caso de erro, retorna um resultado de risco moderado
    return {
      risk: 0.5,
      blocked: false,
      reason: `Erro na análise de saída: ${(error as Error).message}`
    };
  }
} 

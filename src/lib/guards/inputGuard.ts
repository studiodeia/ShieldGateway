import { GuardResult, InputGuardConfig } from './types';
import { Logger } from '../../utils/logger';

/**
 * Configuração padrão para análise de entrada
 */
export const DEFAULT_INPUT_GUARD_CONFIG: InputGuardConfig = {
  injectionPatterns: [
    /\b(system|user|assistant)\s*instructions?\b/i,
    /\bignore\s+(previous|above|earlier)\s+instructions\b/i,
    /\bdo\s+not\s+(follow|obey)\s+instructions\b/i,
  ],
  piiPatterns: [
    /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/, // CPF parcial
    /\b\d{2}[\s.-]?\d{4,5}[\s.-]?\d{4}\b/, // Telefone BR
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, // Email
  ],
  blockedKeywords: [
    'senha',
    'password',
    'chave secreta',
    'secret key',
    'api key',
    'token'
  ],
  maxInputLength: 32000
};

/**
 * Analisa entrada do usuário para detectar riscos de segurança
 * @param input Texto de entrada do usuário
 * @param config Configuração de análise de segurança
 * @returns Resultado da análise
 */
export function analyzeInput(
  input: string,
  config: InputGuardConfig = DEFAULT_INPUT_GUARD_CONFIG
): GuardResult {
  // Verificar comprimento máximo
  if (input.length > config.maxInputLength) {
    Logger.warn(`Entrada excede tamanho máximo permitido: ${input.length} > ${config.maxInputLength}`);
    return {
      risk: 0.7,
      blocked: true,
      reason: `Entrada excede tamanho máximo (${config.maxInputLength} caracteres)`
    };
  }

  // Verificar padrões de injeção
  for (const pattern of config.injectionPatterns) {
    if (pattern.test(input)) {
      Logger.warn(`Padrão de injeção detectado: ${pattern}`);
      return {
        risk: 0.9,
        blocked: true,
        reason: 'Tentativa de injeção de prompt detectada'
      };
    }
  }

  // Verificar PII
  for (const pattern of config.piiPatterns) {
    if (pattern.test(input)) {
      Logger.warn('Informação pessoal identificável (PII) detectada na entrada');
      return {
        risk: 0.8,
        blocked: true,
        reason: 'Informação pessoal identificável (PII) detectada'
      };
    }
  }

  // Verificar palavras-chave bloqueadas
  for (const keyword of config.blockedKeywords) {
    if (input.toLowerCase().includes(keyword.toLowerCase())) {
      Logger.warn(`Palavra-chave bloqueada detectada: ${keyword}`);
      return {
        risk: 0.7,
        blocked: true,
        reason: `Palavra-chave bloqueada detectada: '${keyword}'`
      };
    }
  }

  // Análise geral de risco
  let riskScore = 0;
  
  // Comprimento suspeito (não bloqueado, mas marcado como potencial risco)
  if (input.length > config.maxInputLength * 0.8) {
    riskScore += 0.3;
  }
  
  // Capitalização excessiva
  const uppercaseRatio = input.replace(/[^A-Z]/g, '').length / input.replace(/[^A-Za-z]/g, '').length;
  if (uppercaseRatio > 0.5 && input.length > 20) {
    riskScore += 0.2;
  }
  
  // Caracteres repetidos
  if (/(.)\1{10,}/.test(input)) {
    riskScore += 0.3;
  }

  Logger.debug(`Análise de entrada concluída com risco: ${riskScore}`);
  
  return {
    risk: Math.min(riskScore, 0.6), // Limita o risco a 0.6 para entradas não bloqueadas
    blocked: false,
    reason: riskScore > 0.3 ? 'Entrada com elementos potencialmente suspeitos' : 'Entrada válida'
  };
} 
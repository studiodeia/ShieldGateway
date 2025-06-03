/**
 * Resultado da análise de segurança
 */
export interface GuardResult {
  /** Nível de risco detectado (0-1) */
  risk: number;
  /** Se o conteúdo deve ser bloqueado */
  blocked: boolean;
  /** Motivo da detecção de risco ou bloqueio */
  reason: string;
}

/**
 * Configuração de segurança do ShieldGateway
 */
export interface ShieldConfig {
  /** Modo de operação (permissive, balanced, strict) */
  mode: string;
  /** Política de segurança (default, highSecurity, performance) */
  policy: string;
}

/**
 * Configuração para análise de input
 */
export interface InputGuardConfig {
  /** Regexes para detectar injeções de prompt */
  injectionPatterns: RegExp[];
  /** Regexes para detectar dados sensíveis */
  piiPatterns: RegExp[];
  /** Palavras-chave bloqueadas */
  blockedKeywords: string[];
  /** Limite de tamanho de entrada */
  maxInputLength: number;
}

/**
 * Configuração para análise de ferramentas
 */
export interface ToolGuardConfig {
  /** Comandos shell bloqueados */
  blockedCommands: RegExp[];
  /** Domínios bloqueados */
  blockedDomains: string[];
  /** Tipos de arquivos bloqueados */
  blockedFileTypes: string[];
  /** Esquemas URL bloqueados */
  blockedSchemes: string[];
}

/**
 * Configuração para o guard de análise de saída
 */
export interface OutputGuardConfig {
  /** Tamanho máximo permitido para a saída */
  maxLength: number;
  
  /** Padrões regex para detecção de informações sensíveis */
  sensitivePatterns: RegExp[];
  
  /** Padrões regex para conteúdo totalmente bloqueado */
  blockedContentPatterns: RegExp[];
  
  /** Texto usado para substituir conteúdo sensível */
  redactedText: string;
}

export type PolicyType = 'default' | 'highSecurity' | 'performance';

export interface LogEventData {
  stage: 'input' | 'tool' | 'output';
  content: string;
  verdict: 'blocked' | 'allowed';
  risk: number;
  reason: string;
  timestamp?: number;
} 

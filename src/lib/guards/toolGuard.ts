import { GuardResult, PolicyType, ToolGuardConfig } from './types';
import * as jsonpath from 'jsonpath';
import { Logger } from '../../utils/logger';

const logger = new Logger();

// Lista de padrões de comandos perigosos em shell
const DANGEROUS_SHELL_PATTERNS = [
  /rm\s+(-rf?|--force)\s+/i,
  /mkfs/i,
  /dd\s+if/i,
  /((sudo|su)\s+)?wget.+(\||>)/i,
  /curl.+(\||>)/i,
  /eval\(/i,
  /system\(/i,
  /exec\(/i,
  /child_process/i,
];

// Lista de domínios/ações perigosos em HTTP
const DANGEROUS_HTTP_PATTERNS = [
  /https?:\/\/([^/]+\.)?evil\./i,
  /https?:\/\/([^/]+\.)?malware\./i,
  /https?:\/\/([^/]+\.)?pishing\./i,
  /(\.onion|\.tor)\b/i,
];

// Lista de funções/ações bloqueadas
const BLOCKED_FUNCTIONS = [
  'executeShellCommand',
  'deleteAllFiles',
  'formatDisk',
  'executeArbitraryCode',
  'installSoftware',
  'sendSensitiveData',
  'accessSystemFiles',
];

/**
 * Configuração padrão para análise de ferramentas
 */
export const DEFAULT_TOOL_GUARD_CONFIG: ToolGuardConfig = {
  blockedShellCommands: [
    'rm -rf', 'format', 'del', 'rmdir', 'shutdown', 'reboot',
    'wget', 'curl', 'ssh', 'scp', 'ftp', 'telnet',
    'eval', 'exec', 'chmod', 'sudo', 'su'
  ],
  blockedDomains: [
    'malware.com',
    'phishing.net',
    'suspicious.org',
    'torrent',
    'warez'
  ],
  blockedFileTypes: [
    '.exe', '.bat', '.sh', '.dll', '.so',
    '.apk', '.app', '.vbs', '.ps1', '.cmd'
  ],
  blockedUrlSchemes: [
    'file:',
    'data:',
    'ftp:',
    'telnet:',
    'ssh:',
    'javascript:'
  ]
};

/**
 * Verifica as ferramentas/funções a serem utilizadas para identificar ações perigosas
 * @param data Objeto contendo ferramentas a serem verificadas
 * @param policy Política de segurança
 * @returns Resultado da verificação
 */
export async function toolGuard(data: any, policy: PolicyType): Promise<GuardResult> {
  const result: GuardResult = {
    blocked: false,
    risk: 0,
    reason: '',
  };

  // Extrair ferramentas ou funções do objeto de dados
  const tools = data.tools || data.functions || [];
  if (!tools || tools.length === 0) {
    return result; // Sem ferramentas para verificar
  }

  // Verificar cada ferramenta/função
  const violations: string[] = [];

  // Funções de nomes bloqueados
  const toolNames = jsonpath.query(tools, '$[*].name');
  for (const name of toolNames) {
    if (BLOCKED_FUNCTIONS.includes(name)) {
      violations.push(`Função bloqueada: ${name}`);
      result.risk += 0.5;
    }
  }

  // Verificar comandos shell perigosos
  if (policy !== 'performance') {
    // Procurar parâmetros que podem conter comandos shell
    const shellParams = jsonpath.query(tools, '$[*].parameters[*][*]');
    for (const param of shellParams) {
      if (typeof param === 'string') {
        for (const pattern of DANGEROUS_SHELL_PATTERNS) {
          if (pattern.test(param)) {
            violations.push(`Comando shell perigoso detectado: ${pattern}`);
            result.risk += 0.4;
          }
        }
      }
    }
  }

  // Verificar URLs HTTP perigosos
  const urlParams = jsonpath.query(tools, '$[*]..url') as string[];
  for (const url of urlParams) {
    if (typeof url === 'string') {
      for (const pattern of DANGEROUS_HTTP_PATTERNS) {
        if (pattern.test(url)) {
          violations.push(`URL suspeito detectado: ${url}`);
          result.risk += 0.3;
        }
      }
    }
  }

  // Em políticas de alta segurança, também bloqueamos chamadas HTTP não autorizadas
  if (policy === 'highSecurity') {
    const httpTools = jsonpath.query(tools, '$[?(@.name=="httpRequest")]');
    if (httpTools.length > 0) {
      // Verificação adicional pode ser implementada aqui
      // Por exemplo, lista de URLs permitidos
      result.risk += 0.2;
      violations.push('Uso de ferramenta HTTP em modo de alta segurança');
    }
  }

  // Determinar se deve bloquear com base no risco
  if (violations.length > 0) {
    result.blocked = result.risk > 0.7;
    result.reason = violations.join('; ');
  }

  return result;
}

/**
 * Analisa chamadas de ferramentas para detectar riscos de segurança
 * @param toolName Nome da ferramenta sendo chamada
 * @param params Parâmetros passados para a ferramenta
 * @param config Configuração de análise de segurança
 * @returns Resultado da análise
 */
export function analyzeToolCall(
  toolName: string,
  params: Record<string, any>,
  config: ToolGuardConfig = DEFAULT_TOOL_GUARD_CONFIG
): GuardResult {
  // Verifica comandos shell
  if (toolName === 'run_terminal_cmd' && params.command) {
    const command = String(params.command).toLowerCase();
    
    for (const blockedCmd of config.blockedShellCommands) {
      if (command.includes(blockedCmd.toLowerCase())) {
        logger.warn(`Comando shell bloqueado detectado: ${blockedCmd}`);
        return {
          risk: 0.9,
          blocked: true,
          reason: `Comando shell bloqueado: ${blockedCmd}`
        };
      }
    }
  }

  // Verifica URLs e domínios em todos os parâmetros
  const paramString = JSON.stringify(params).toLowerCase();
  
  // Verifica domínios bloqueados
  for (const domain of config.blockedDomains) {
    if (paramString.includes(domain.toLowerCase())) {
      logger.warn(`Domínio bloqueado detectado: ${domain}`);
      return {
        risk: 0.8,
        blocked: true,
        reason: `Domínio bloqueado: ${domain}`
      };
    }
  }

  // Verifica tipos de arquivo bloqueados
  for (const fileType of config.blockedFileTypes) {
    if (paramString.includes(fileType.toLowerCase())) {
      logger.warn(`Tipo de arquivo bloqueado detectado: ${fileType}`);
      return {
        risk: 0.7,
        blocked: true,
        reason: `Tipo de arquivo bloqueado: ${fileType}`
      };
    }
  }

  // Verifica esquemas de URL bloqueados
  for (const scheme of config.blockedUrlSchemes) {
    if (paramString.includes(scheme.toLowerCase())) {
      logger.warn(`Esquema de URL bloqueado detectado: ${scheme}`);
      return {
        risk: 0.8,
        blocked: true,
        reason: `Esquema de URL bloqueado: ${scheme}`
      };
    }
  }

  // Análise geral de risco
  let riskScore = 0;
  
  // Ferramentas de potencial risco
  if (['edit_file', 'delete_file', 'run_terminal_cmd'].includes(toolName)) {
    riskScore += 0.3;
    logger.info(`Ferramenta de potencial risco sendo utilizada: ${toolName}`);
  }
  
  // Casos específicos para arquivos de sistema
  if (toolName === 'edit_file' && params.target_file) {
    const targetFile = String(params.target_file);
    if (targetFile.includes('/etc/') || 
        targetFile.includes('/bin/') || 
        targetFile.includes(':\\Windows\\') ||
        targetFile.includes(':\\System')) {
      logger.warn(`Tentativa de editar arquivo de sistema: ${targetFile}`);
      return {
        risk: 0.8,
        blocked: true,
        reason: 'Tentativa de modificar arquivo de sistema'
      };
    }
  }

  logger.debug(`Análise de ferramenta ${toolName} concluída com risco: ${riskScore}`);
  
  return {
    risk: Math.min(riskScore, 0.5), // Limita o risco a 0.5 para chamadas não bloqueadas
    blocked: false,
    reason: riskScore > 0.3 ? 'Ferramenta com operação potencialmente sensível' : 'Ferramenta segura'
  };
} 
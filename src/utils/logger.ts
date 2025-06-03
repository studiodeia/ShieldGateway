/**
 * Níveis de log suportados
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4,
}

/**
 * Configuração para o logger
 */
export interface LoggerConfig {
  /** Nível mínimo de log a ser exibido */
  level: LogLevel;
  /** Habilitar logs coloridos no console (padrão: true) */
  enableColors: boolean;
  /** Prefixo para os logs (padrão: 'ShieldGateway') */
  prefix: string;
  /** Habilitar timestamp nos logs (padrão: true) */
  showTimestamp: boolean;
}

/**
 * Configuração padrão do logger
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  enableColors: true,
  prefix: 'ShieldGateway',
  showTimestamp: true,
};

/**
 * Cores para os diferentes níveis de log
 */
const LOG_COLORS = {
  [LogLevel.ERROR]: '\x1b[31m', // Vermelho
  [LogLevel.WARN]: '\x1b[33m',  // Amarelo
  [LogLevel.INFO]: '\x1b[36m',  // Ciano
  [LogLevel.DEBUG]: '\x1b[35m', // Magenta
  [LogLevel.TRACE]: '\x1b[90m', // Cinza
  reset: '\x1b[0m',             // Reset
};

/**
 * Nomes dos níveis de log
 */
const LOG_LEVEL_NAMES = {
  [LogLevel.ERROR]: 'ERROR',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.TRACE]: 'TRACE',
};

/**
 * Classe para gerenciamento e emissão de logs
 */
export class Logger {
  private static config: LoggerConfig = DEFAULT_CONFIG;

  /**
   * Configura o logger
   * @param config Configuração parcial para mesclar com o padrão
   */
  public static configure(config: Partial<LoggerConfig>): void {
    Logger.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Define o nível de log
   * @param level Novo nível de log
   */
  public static setLevel(level: LogLevel): void {
    Logger.config.level = level;
  }

  /**
   * Obtém a configuração atual do logger
   */
  public static getConfig(): LoggerConfig {
    return { ...Logger.config };
  }

  /**
   * Log de nível ERROR
   * @param message Mensagem a ser logada
   * @param meta Metadados adicionais (opcional)
   */
  public static error(message: string, meta?: any): void {
    Logger.log(LogLevel.ERROR, message, meta);
  }

  /**
   * Log de nível WARN
   * @param message Mensagem a ser logada
   * @param meta Metadados adicionais (opcional)
   */
  public static warn(message: string, meta?: any): void {
    Logger.log(LogLevel.WARN, message, meta);
  }

  /**
   * Log de nível INFO
   * @param message Mensagem a ser logada
   * @param meta Metadados adicionais (opcional)
   */
  public static info(message: string, meta?: any): void {
    Logger.log(LogLevel.INFO, message, meta);
  }

  /**
   * Log de nível DEBUG
   * @param message Mensagem a ser logada
   * @param meta Metadados adicionais (opcional)
   */
  public static debug(message: string, meta?: any): void {
    Logger.log(LogLevel.DEBUG, message, meta);
  }

  /**
   * Log de nível TRACE
   * @param message Mensagem a ser logada
   * @param meta Metadados adicionais (opcional)
   */
  public static trace(message: string, meta?: any): void {
    Logger.log(LogLevel.TRACE, message, meta);
  }

  /**
   * Método principal para emissão de logs
   * @param level Nível do log
   * @param message Mensagem a ser logada
   * @param meta Metadados adicionais (opcional)
   */
  private static log(level: LogLevel, message: string, meta?: any): void {
    // Verifica se o nível está habilitado
    if (level > Logger.config.level) return;

    const timestamp = Logger.config.showTimestamp ? new Date().toISOString() : '';
    const prefix = Logger.config.prefix;
    const levelName = LOG_LEVEL_NAMES[level];
    
    let logLine = '';
    
    if (Logger.config.enableColors) {
      const color = LOG_COLORS[level];
      const reset = LOG_COLORS.reset;
      
      logLine = `${color}${timestamp} [${prefix}] ${levelName}:${reset} ${message}`;
    } else {
      logLine = `${timestamp} [${prefix}] ${levelName}: ${message}`;
    }
    
    // Seleciona o método de console apropriado
    const consoleMethod = level === LogLevel.ERROR ? 'error' : 
                          level === LogLevel.WARN ? 'warn' : 'log';
    
    if (meta) {
      console[consoleMethod](logLine, meta);
    } else {
      console[consoleMethod](logLine);
    }
  }
} 

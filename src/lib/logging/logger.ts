import * as fs from 'fs';
import * as path from 'path';
import { LogEventData } from '../guards/types';
import Database from 'better-sqlite3';

// Configuração
let dbInstance: Database.Database | null = null;
const DEFAULT_LOG_PATH = './logs/shield-gateway.db';

/**
 * Inicializa ou retorna a instância do banco de dados SQLite
 */
function getDbInstance(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  // Determinar caminho do banco de dados
  const dbPath = process.env.SHIELD_GATEWAY_DB_PATH || DEFAULT_LOG_PATH;
  
  // Garantir que o diretório existe
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  // Criar instância do banco de dados
  dbInstance = new Database(dbPath);
  
  // Criar tabela de eventos se não existir
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS security_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      stage TEXT NOT NULL,
      content TEXT,
      verdict TEXT NOT NULL,
      risk REAL,
      reason TEXT,
      workflow_id TEXT,
      node_id TEXT,
      execution_id TEXT
    )
  `);
  
  return dbInstance;
}

/**
 * Registra um evento de segurança no banco de dados
 * @param event Dados do evento a serem registrados
 */
export async function logEvent(event: LogEventData): Promise<void> {
  try {
    const db = getDbInstance();
    
    // Preparar dados para inserção
    const timestamp = event.timestamp || Date.now();
    const workflowId = process.env.WORKFLOW_ID || null;
    const nodeId = process.env.NODE_ID || null;
    const executionId = process.env.EXECUTION_ID || null;
    
    // Inserir evento no banco de dados
    const stmt = db.prepare(`
      INSERT INTO security_events 
      (timestamp, stage, content, verdict, risk, reason, workflow_id, node_id, execution_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      timestamp,
      event.stage,
      event.content,
      event.verdict,
      event.risk,
      event.reason,
      workflowId,
      nodeId,
      executionId
    );
  } catch (error) {
    console.error('Erro ao registrar evento de segurança:', error);
    // Em caso de falha, tentamos registrar em um arquivo de texto como fallback
    logToFile(event);
  }
}

/**
 * Método de fallback para registrar em arquivo texto quando o SQLite falha
 * @param event Dados do evento a serem registrados
 */
function logToFile(event: LogEventData): void {
  try {
    const logDir = path.dirname(DEFAULT_LOG_PATH);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logFile = path.join(logDir, 'shield-gateway-fallback.log');
    const timestamp = event.timestamp || Date.now();
    const date = new Date(timestamp).toISOString();
    
    const logLine = `[${date}] [${event.stage}] [${event.verdict}] [risk=${event.risk}] ${event.reason}\n`;
    
    fs.appendFileSync(logFile, logLine);
  } catch (error) {
    console.error('Erro ao registrar evento no arquivo de log:', error);
  }
}

/**
 * Retorna os eventos de segurança mais recentes
 * @param limit Número máximo de eventos a retornar
 * @param offset Deslocamento para paginação
 */
export function getRecentEvents(limit: number = 100, offset: number = 0): LogEventData[] {
  try {
    const db = getDbInstance();
    
    const stmt = db.prepare(`
      SELECT timestamp, stage, content, verdict, risk, reason
      FROM security_events
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);
    
    const rows = stmt.all(limit, offset) as any[];
    
    return rows.map(row => ({
      timestamp: row.timestamp,
      stage: row.stage,
      content: row.content,
      verdict: row.verdict,
      risk: row.risk,
      reason: row.reason
    }));
  } catch (error) {
    console.error('Erro ao obter eventos recentes:', error);
    return [];
  }
} 
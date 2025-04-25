#!/usr/bin/env node

import { getRecentEvents } from '../logging/logger';
import * as readline from 'readline';

// Cores para terminal
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Constantes para visualização
const RISK_THRESHOLD_HIGH = 0.7;
const RISK_THRESHOLD_MEDIUM = 0.3;

/**
 * Converte um nível de risco em uma cor
 * @param risk Nível de risco de 0 a 1
 * @returns String de cores ANSI
 */
function getRiskColor(risk: number): string {
  if (risk >= RISK_THRESHOLD_HIGH) {
    return colors.red;
  } else if (risk >= RISK_THRESHOLD_MEDIUM) {
    return colors.yellow;
  } else {
    return colors.green;
  }
}

/**
 * Formata data para exibição
 * @param timestamp Timestamp em milissegundos
 * @returns Data formatada
 */
function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Visualizador de eventos de segurança via CLI
 * @param limit Número máximo de eventos a exibir
 */
function viewEvents(limit: number = 50): void {
  const events = getRecentEvents(limit);
  
  if (events.length === 0) {
    console.log(`${colors.yellow}Nenhum evento de segurança encontrado.${colors.reset}`);
    return;
  }

  console.log(`${colors.cyan}==== ShieldGateway - Eventos de Segurança ====${colors.reset}`);
  console.log(`${colors.cyan}Total de eventos: ${events.length}${colors.reset}`);
  console.log('\n');

  // Exibir eventos
  events.forEach((event, index) => {
    const riskColor = getRiskColor(event.risk);
    const verdictColor = event.verdict === 'blocked' ? colors.red : colors.green;
    
    console.log(`${colors.cyan}[${index + 1}] ${formatDate(event.timestamp || 0)}${colors.reset}`);
    console.log(`${colors.blue}Estágio:${colors.reset} ${event.stage}`);
    console.log(`${colors.blue}Veredicto:${colors.reset} ${verdictColor}${event.verdict}${colors.reset}`);
    console.log(`${colors.blue}Risco:${colors.reset} ${riskColor}${event.risk.toFixed(2)}${colors.reset}`);
    
    if (event.reason) {
      console.log(`${colors.blue}Razão:${colors.reset} ${event.reason}`);
    }
    
    if (event.content) {
      const preview = event.content.length > 50 
        ? event.content.substring(0, 47) + '...' 
        : event.content;
      console.log(`${colors.blue}Conteúdo:${colors.reset} ${preview}`);
    }
    
    console.log('\n');
  });
}

/**
 * Menu interativo para o CLI
 */
function showMenu(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.clear();
  console.log(`${colors.cyan}=== ShieldGateway CLI ====${colors.reset}\n`);
  console.log(`${colors.white}1. Visualizar últimos 20 eventos${colors.reset}`);
  console.log(`${colors.white}2. Visualizar últimos 50 eventos${colors.reset}`);
  console.log(`${colors.white}3. Visualizar últimos 100 eventos${colors.reset}`);
  console.log(`${colors.white}q. Sair${colors.reset}\n`);
  
  rl.question(`${colors.cyan}Escolha uma opção: ${colors.reset}`, (answer) => {
    rl.close();
    
    switch (answer.toLowerCase()) {
      case '1':
        console.clear();
        viewEvents(20);
        promptContinue();
        break;
      case '2':
        console.clear();
        viewEvents(50);
        promptContinue();
        break;
      case '3':
        console.clear();
        viewEvents(100);
        promptContinue();
        break;
      case 'q':
        console.log(`${colors.cyan}Saindo...${colors.reset}`);
        process.exit(0);
        break;
      default:
        console.log(`${colors.yellow}Opção inválida.${colors.reset}`);
        promptContinue();
    }
  });
}

/**
 * Prompt para continuar ou sair
 */
function promptContinue(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  rl.question(`\n${colors.cyan}Pressione Enter para voltar ao menu ou 'q' para sair: ${colors.reset}`, (answer) => {
    rl.close();
    
    if (answer.toLowerCase() === 'q') {
      console.log(`${colors.cyan}Saindo...${colors.reset}`);
      process.exit(0);
    } else {
      showMenu();
    }
  });
}

// Iniciar cli se for o script principal
if (require.main === module) {
  showMenu();
}

// Exportar funções principais
export { viewEvents }; 
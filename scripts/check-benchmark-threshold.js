#!/usr/bin/env node

/**
 * Script para verificar se os resultados de benchmark estão dentro dos thresholds
 * Uso: node check-benchmark-threshold.js [threshold_ms]
 * Ex: node check-benchmark-threshold.js 30
 */

const fs = require('fs');
const path = require('path');

// Ler argumentos da linha de comando
const thresholdArg = process.argv[2];
const THRESHOLD_MS = thresholdArg ? parseFloat(thresholdArg) : 30; // default 30ms

// Verificar se arquivo de resultados existe
const resultFilePath = path.join(__dirname, '..', 'benchmark-results.json');
if (!fs.existsSync(resultFilePath)) {
  console.error('Erro: Arquivo de resultados de benchmark não encontrado.');
  console.error('Execute o benchmark primeiro: npm run benchmark');
  process.exit(1);
}

// Carregar resultados
let benchmarkResults;
try {
  const fileContent = fs.readFileSync(resultFilePath, 'utf8');
  benchmarkResults = JSON.parse(fileContent);
} catch (error) {
  console.error('Erro ao carregar resultados de benchmark:', error.message);
  process.exit(1);
}

// Extrair resultados do pipeline completo
const pipelineResults = benchmarkResults.results.filter(r => 
  r.name.startsWith('pipeline_completo/'));

if (pipelineResults.length === 0) {
  console.error('Erro: Nenhum resultado do pipeline completo encontrado.');
  process.exit(1);
}

// Verificar latências
const maxAvgLatency = Math.max(...pipelineResults.map(r => parseFloat(r.avg)));
const maxP95Latency = Math.max(...pipelineResults.map(r => parseFloat(r.p95)));

console.log(`Verificando thresholds de latência (limite: ${THRESHOLD_MS}ms)`);
console.log(`Ambiente: Node ${benchmarkResults.environment.node} ${benchmarkResults.environment.platform}/${benchmarkResults.environment.arch}`);
console.log(`Timestamp: ${benchmarkResults.timestamp}`);
console.log('\nResultados do pipeline:');

let failedThreshold = false;

pipelineResults.forEach(result => {
  const avg = parseFloat(result.avg);
  const p95 = parseFloat(result.p95);
  const avgPassed = avg <= THRESHOLD_MS;
  const p95Passed = p95 <= THRESHOLD_MS * 1.5; // P95 pode ser até 50% maior que o threshold médio
  
  console.log(`${result.name}:`);
  console.log(`  Média: ${avg.toFixed(2)}ms ${avgPassed ? '✅' : '❌'}`);
  console.log(`  P95:   ${p95.toFixed(2)}ms ${p95Passed ? '✅' : '❌'}`);
  
  if (!avgPassed || !p95Passed) {
    failedThreshold = true;
  }
});

console.log('\nResultado geral:');
console.log(`Latência média máxima: ${maxAvgLatency.toFixed(2)}ms`);
console.log(`Latência P95 máxima:   ${maxP95Latency.toFixed(2)}ms`);

if (failedThreshold) {
  console.log('\n❌ Falha: Alguns resultados excedem o threshold de latência.');
  process.exit(1);
} else {
  console.log('\n✅ Sucesso: Todos os resultados estão dentro dos thresholds de latência.');
  process.exit(0);
} 
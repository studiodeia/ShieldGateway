#!/usr/bin/env node

/**
 * Script para verificar integridade da hash-chain dos logs WORM
 * Uso: node scripts/verify-chain.js [--limit=100] [--bucket=guardagent-dev-logs]
 */

const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

// Configuração
const config = {
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: process.env.WORM_BUCKET_NAME || 'guardagent-dev-logs',
  limit: 100,
};

// Parse argumentos da linha de comando
process.argv.forEach(arg => {
  if (arg.startsWith('--limit=')) {
    config.limit = parseInt(arg.split('=')[1]);
  }
  if (arg.startsWith('--bucket=')) {
    config.bucket = arg.split('=')[1];
  }
});

const s3Client = new S3Client({
  region: config.region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * Gera hash SHA-256 para o conteúdo
 */
function generateHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Lista objetos da hash-chain no S3
 */
async function listChainObjects() {
  try {
    const command = new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: 'chain/',
      MaxKeys: config.limit,
    });

    const response = await s3Client.send(command);
    return response.Contents || [];
  } catch (error) {
    console.error('❌ Erro ao listar objetos da chain:', error.message);
    return [];
  }
}

/**
 * Baixa e parseia objeto da chain
 */
async function getChainObject(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
    });

    const response = await s3Client.send(command);
    const content = await streamToString(response.Body);
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Erro ao baixar objeto ${key}:`, error.message);
    return null;
  }
}

/**
 * Converte stream para string
 */
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Verifica integridade da hash-chain
 */
async function verifyChain() {
  console.log(`🔍 Verificando integridade da hash-chain...`);
  console.log(`📦 Bucket: ${config.bucket}`);
  console.log(`📊 Limite: ${config.limit} registros\n`);

  const objects = await listChainObjects();
  
  if (objects.length === 0) {
    console.log('⚠️  Nenhum objeto encontrado na chain');
    return { valid: true, errors: [], total: 0 };
  }

  // Ordenar por data de modificação
  objects.sort((a, b) => new Date(a.LastModified) - new Date(b.LastModified));

  const errors = [];
  let previousHash = '';
  let validCount = 0;

  console.log(`📋 Verificando ${objects.length} objetos da chain...\n`);

  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i];
    const chainEntry = await getChainObject(obj.Key);
    
    if (!chainEntry) {
      errors.push(`Falha ao baixar objeto: ${obj.Key}`);
      continue;
    }

    // Verificar estrutura do objeto
    if (!chainEntry.hash || !chainEntry.timestamp || !chainEntry.logId) {
      errors.push(`Estrutura inválida em ${obj.Key}: campos obrigatórios ausentes`);
      continue;
    }

    // Verificar hash do próprio objeto
    const expectedHash = generateHash(JSON.stringify(chainEntry, null, 2));
    const actualHash = obj.Key.replace('chain/', '').replace('.json', '');
    
    if (expectedHash !== actualHash) {
      errors.push(`Hash inválido em ${obj.Key}: esperado ${expectedHash}, encontrado ${actualHash}`);
      continue;
    }

    // Verificar ligação com hash anterior (exceto primeiro)
    if (i > 0 && chainEntry.previousHash !== previousHash) {
      errors.push(`Quebra na chain em ${obj.Key}: previousHash ${chainEntry.previousHash} != hash anterior ${previousHash}`);
      continue;
    }

    previousHash = chainEntry.hash;
    validCount++;

    // Log de progresso
    if (i % 10 === 0 || i === objects.length - 1) {
      console.log(`✅ Verificados ${i + 1}/${objects.length} objetos`);
    }
  }

  const isValid = errors.length === 0;
  
  console.log('\n📊 RESULTADO DA VERIFICAÇÃO:');
  console.log(`Total de objetos: ${objects.length}`);
  console.log(`Objetos válidos: ${validCount}`);
  console.log(`Erros encontrados: ${errors.length}`);
  
  if (isValid) {
    console.log('✅ Hash-chain íntegra - todos os registros são válidos!');
  } else {
    console.log('❌ Hash-chain comprometida - erros encontrados:');
    errors.forEach(error => console.log(`   • ${error}`));
  }

  return {
    valid: isValid,
    errors,
    total: objects.length,
    valid_count: validCount,
  };
}

/**
 * Função principal
 */
async function main() {
  try {
    const result = await verifyChain();
    
    // Exit code baseado no resultado
    process.exit(result.valid ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Erro fatal:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { verifyChain };

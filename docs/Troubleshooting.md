# Solução de Problemas

Este guia ajuda a resolver problemas comuns ao usar o ShieldGateway.

## Problemas de Instalação

### Erro: Módulo não encontrado

**Problema**: Erro `Cannot find module 'n8n-nodes-shield-gateway'`

**Solução**:
1. Verifique se a instalação foi concluída corretamente
2. Certifique-se de que o diretório `.n8n/custom` existe
3. Reinstale o pacote:
```bash
npm install n8n-nodes-shield-gateway --save
```

## Problemas de Execução

### Erro: Banco de dados não encontrado

**Problema**: `Error: SQLITE_CANTOPEN: cannot open database file`

**Solução**:
1. Verifique se o diretório para o banco de dados existe e tem permissões de escrita
2. Configure o caminho usando a variável de ambiente:
```
SHIELD_GATEWAY_DB_PATH=/caminho/acessivel/shield-gateway.db
```

### Erro: Falha ao conectar com ShieldAPI

**Problema**: `Erro ao conectar com ShieldAPI: Error: Request failed with status code 401`

**Solução**:
1. Verifique se a API Key está configurada corretamente
2. Verifique sua conexão com a internet
3. Tente desativar temporariamente o modo remoto para validar o funcionamento local

### Erro: Bloqueios falso-positivos

**Problema**: O ShieldGateway está bloqueando entradas legítimas

**Solução**:
1. Mude o modo de operação para `permissive` temporariamente
2. Revise os logs para entender o motivo do bloqueio
3. Ajuste a política para `performance` se precisar de menos verificações

## Problemas com Logging

### Erro: Falha ao escrever logs

**Problema**: `Erro ao registrar evento de segurança: Error: SQLITE_READONLY`

**Solução**:
1. Verifique as permissões do diretório de logs
2. Configure um caminho alternativo:
```
SHIELD_GATEWAY_DB_PATH=/outro/caminho/shield-gateway.db
```

### Visualizador CLI não mostra eventos

**Problema**: CLI não exibe nenhum evento, mesmo que deveria haver logs

**Solução**:
1. Verifique o caminho do banco de dados (`SHIELD_GATEWAY_DB_PATH`)
2. Certifique-se de que há eventos registrados
3. Verifique se o CLI está usando o mesmo caminho do banco de dados que o plugin

## Problemas de Performance

### Latência alta ao usar modo remoto

**Problema**: Alta latência quando o modo remoto está habilitado

**Solução**:
1. Reduza o timeout (padrão é 3000ms):
```js
// Ajuste na configuração do nó
const DEFAULT_TIMEOUT = 1500; // Reduzir para 1.5 segundos
```
2. Mude para a política `performance` se o problema persistir
3. Desative temporariamente o modo remoto em fluxos críticos

## Problemas de Permissão

### Erro ao acessar o arquivo de banco de dados

**Problema**: `Error: SQLITE_CANTOPEN: cannot open database file`

**Solução**:
1. Verifique as permissões do usuário que executa o n8n
2. Configure o caminho do banco de dados para uma localização com permissões adequadas
3. Use um caminho absoluto em vez de relativo

## Suporte Adicional

Se os problemas persistirem:

1. Verifique os logs do n8n para erros detalhados
2. Consulte a [documentação do n8n](https://docs.n8n.io/)
3. Abra um issue no [GitHub do projeto](https://github.com/shield-gateway/n8n-nodes-shield-gateway/issues)
4. Entre em contato com o suporte em support@shieldgateway.io (para usuários da versão PRO) 
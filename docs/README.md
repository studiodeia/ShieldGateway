# Documentação do ShieldGateway

## Introdução

ShieldGateway é um LLM Firewall plug-and-play para proteger fluxos de trabalho n8n baseados em IA contra ameaças como injeções de prompt, vazamento de dados e uso indevido de ferramentas.

## Arquitetura

O ShieldGateway opera em uma arquitetura híbrida:

1. **Plugin Local**: Nó n8n com processamento local de baixa latência
2. **ShieldAPI**: Serviço remoto opcional para monitoramento avançado

```
┌─ Workflow n8n ───────────────────────────────────────────┐
│ ChatTrigger → ShieldGateway(Node) → AI Agent / Tools … │
│     ▲ pre-exec │  │ post-exec ▼                       │
│     └──────────┴── logs SQLite │ REST /v1/check (opt.) │
└──────────────────────────────────────────────────────────┘
                    ▲                               ▲
            ShieldAPI (CrewAI) ← feed intel ────────┘
```

## Camadas de Proteção

- **Input Guard**: Verifica conteúdo antes de ir para o LLM
- **Tool Guard**: Valida chamadas de ferramentas e funções
- **Output Guard**: Filtra dados sensíveis na resposta do LLM

## Instalação

```bash
# Instalação via npm
npm install n8n-nodes-shield-gateway

# Ou via yarn
yarn add n8n-nodes-shield-gateway
```

## Configuração

### Parâmetros do Nó

- **Modo de Operação**:
  - `permissive`: Apenas loga ameaças, não bloqueia
  - `balanced`: Bloqueia ameaças de alto risco, loga as demais
  - `strict`: Bloqueia qualquer ameaça potencial

- **Política de Segurança**:
  - `default`: Política balanceada para maioria dos casos
  - `highSecurity`: Foco em prevenção de vazamentos e ataques
  - `performance`: Otimiza para latência mínima

- **Modo Remoto**: Ativa ou desativa o uso da ShieldAPI

- **API Key**: Chave para a ShieldAPI (necessário se modo remoto estiver ativado)

### Variáveis de Ambiente

```
# Caminho para o banco de dados de log
SHIELD_GATEWAY_DB_PATH=/caminho/para/shield-gateway.db
```

## CLI para Visualização de Logs

O ShieldGateway inclui uma CLI para visualizar os logs de segurança:

```bash
# Executa a CLI
npx shield-gateway-cli
```

## Exemplos de Uso

### Exemplo Básico

1. Adicione o nó ShieldGateway entre seu gatilho e o nó de IA
2. Configure o campo de entrada para verificar (ex: `prompt`)
3. Configure o campo de saída para validar (ex: `response`)
4. Escolha o modo de operação (`balanced` recomendado para início)

### Usando Modo Remoto

1. Obtenha uma API Key em [shieldgateway.io](https://shieldgateway.io)
2. Ative o modo remoto no nó
3. Configure a API Key
4. Os eventos serão registrados localmente e remotamente

## Resolução de Problemas

Veja [Troubleshooting.md](./Troubleshooting.md) para problemas comuns e soluções.

## Roadmap e Contribuições

Confira nosso [Roadmap](./Roadmap.md) e [Guia de Contribuição](./Contributing.md). 
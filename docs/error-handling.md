# Guia de Tratamento de Erros e Fallback

Este documento descreve como o ShieldGateway lida com erros de comunicação com a ShieldAPI 
e os mecanismos de fallback implementados.

## Comportamento de Fallback

O ShieldGateway implementa duas estratégias principais de fallback para lidar com falhas 
na comunicação com a ShieldAPI:

| Estratégia   | Descrição                                                   | Caso de Uso                               |
|--------------|-------------------------------------------------------------|-------------------------------------------|
| **Fail-Open**  | Permite a operação mesmo em caso de falha na comunicação  | Prioriza disponibilidade sobre segurança  |
| **Fail-Closed** | Bloqueia a operação em caso de falha na comunicação     | Prioriza segurança sobre disponibilidade  |

A estratégia padrão é **Fail-Open**, mas pode ser alterada nas configurações avançadas do nó.

## Códigos de Erro e Comportamento

A tabela abaixo descreve os possíveis códigos de erro HTTP retornados pela ShieldAPI e o 
comportamento correspondente do ShieldGateway:

| Código HTTP | Descrição                      | Retry? | Comportamento                                         | Log                                                                |
|-------------|--------------------------------|--------|------------------------------------------------------|---------------------------------------------------------------------|
| **400**     | Requisição inválida            | Não    | Falha (sempre), registra no log                      | `Erro 400: Parâmetros inválidos na requisição para ShieldAPI`     |
| **401**     | Não autorizado                 | Não    | Fallback para análise local, registra no log         | `Erro 401: API Key inválida ou expirada`                          |
| **403**     | Proibido                       | Não    | Fallback para análise local, registra no log         | `Erro 403: Acesso não autorizado à ShieldAPI`                     |
| **408**     | Timeout na requisição          | Sim    | Retry, depois fallback conforme configuração         | `Erro 408: Timeout na requisição para ShieldAPI`                  |
| **429**     | Limite de requisições excedido | Sim    | Retry com backoff, depois fallback                   | `Erro 429: Limite de requisições excedido (retry em {X}ms)`       |
| **500**     | Erro interno do servidor       | Sim    | Retry, depois fallback conforme configuração         | `Erro 500: Erro interno no servidor ShieldAPI`                    |
| **502**     | Bad Gateway                    | Sim    | Retry, depois fallback conforme configuração         | `Erro 502: Erro de comunicação com o backend ShieldAPI`           |
| **503**     | Serviço indisponível           | Sim    | Retry, depois fallback conforme configuração         | `Erro 503: ShieldAPI temporariamente indisponível`                |
| **504**     | Gateway Timeout                | Sim    | Retry, depois fallback conforme configuração         | `Erro 504: Timeout no gateway durante comunicação com ShieldAPI`  |
| **Outros**  | Erros diversos                 | Não    | Fallback para análise local, registra no log         | `Erro {XXX}: Erro inesperado na comunicação com ShieldAPI`        |
| **Network** | Erro de rede                   | Sim    | Retry, depois fallback conforme configuração         | `Erro de rede: Falha na comunicação com ShieldAPI`                |

## Algoritmo de Retry

O ShieldGateway implementa um algoritmo de retry com backoff exponencial para erros retentáveis:

1. Primeira tentativa: imediata
2. Segunda tentativa: após 300ms
3. Terceira tentativa: após 600ms (2 × 300ms)
4. Tentativas adicionais conforme configurado (máximo: 3 por padrão)

A fórmula para o tempo de espera é: `tempo_base × 2^(tentativa-1)`

## Configurando o Comportamento de Fallback

No nó ShieldGateway, você pode configurar o comportamento de fallback nas configurações avançadas:

1. **Modo de Fallback**: Escolha entre "Fail-Open" ou "Fail-Closed"
2. **Número máximo de tentativas**: Defina quantas vezes o nó deve tentar se comunicar com a ShieldAPI antes de ativar o fallback (1-5)

## Implementação de Análise Local

Quando o fallback é ativado, o ShieldGateway usa suas capacidades locais para realizar a análise de segurança:

1. Input Guard: análise de regex para detecção de injeções de prompt e PII
2. Tool Guard: análise de ferramentas para detectar comandos perigosos
3. Output Guard: análise de saída para detectar vazamento de informações sensíveis

## Registros de Fallback

Todos os eventos de fallback são registrados no banco de dados local com informações detalhadas:

```json
{
  "timestamp": "2023-09-01T12:00:00Z",
  "stage": "input",
  "status": "fallback_activated",
  "error": "408: Request Timeout",
  "fallbackMode": "open",
  "retryAttempts": 3,
  "verdict": "allowed",
  "risk": 0.4,
  "content": "..."
}
```

## Monitoramento e Alertas

Para monitorar eventos de fallback:

1. Use a CLI do ShieldGateway para visualizar eventos recentes:
   ```bash
   npx shield-gateway-cli
   ```

2. Configure alertas para eventos de fallback frequentes no ShieldAPI Dashboard (versão Pro)

## Troubleshooting

Se o fallback estiver sendo ativado com frequência:

1. Verifique a conectividade de rede com a ShieldAPI
2. Confirme que sua API Key está válida e ativa
3. Verifique se não está excedendo os limites de uso do seu plano
4. Considere aumentar o timeout da requisição se estiver enfrentando problemas de latência

## Referências

- [Documentação completa da ShieldAPI](https://docs.shieldgateway.io)
- [Especificação OpenAPI](./api-spec.yaml)
- [Guia de Solução de Problemas](./Troubleshooting.md) 
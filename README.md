# ShieldGateway

<p align="center">
  <img src="docs/images/logo.png" alt="ShieldGateway Logo" width="200"/>
</p>

ShieldGateway é um LLM Firewall plug-and-play para n8n que protege seus fluxos de IA contra injeções de prompt, vazamento de dados e uso indevido de ferramentas.

## Sobre

ShieldGateway atua como uma camada de segurança para seus fluxos de trabalho de IA no n8n, monitorando e protegendo contra:

- **Injeção de Prompt**: Detecta e bloqueia tentativas de manipular o modelo de IA
- **Vazamento de Dados Sensíveis**: Previne a exposição de informações confidenciais
- **Uso Indevido de Ferramentas**: Protege contra comandos perigosos e chamadas maliciosas

## Características

- 🛡️ **Proteção em Múltiplas Camadas**: Input, Tool e Output Guards
- 🔄 **Modos Operacionais Flexíveis**: Permissivo, Equilibrado ou Restrito
- 🚀 **Análise Local Rápida**: Integração direta com seu fluxo de trabalho
- 🌐 **Modo Remoto Opcional**: Conecta-se à ShieldAPI para análise avançada
- 📊 **Logging Detalhado**: Rastreamento completo de eventos e alertas

## Instalação

```bash
# A partir do diretório do seu n8n
cd ~/.n8n/custom
npm install n8n-nodes-shield-gateway
```

Ou instale diretamente no n8n usando a opção de Community Nodes.

## Uso Básico

1. Adicione o nó ShieldGateway ao seu fluxo de trabalho
2. Configure de acordo com suas necessidades de segurança
3. Conecte-o entre seus nós de Prompt e LLM

```
[Chat Input] → [ShieldGateway] → [OpenAI] → [ShieldGateway] → [Resposta]
```

## Configuração

ShieldGateway oferece três modos de operação:

- **Permissivo**: Apenas loga ameaças, não bloqueia
- **Equilibrado**: Bloqueia ameaças de alto risco, loga as demais
- **Restrito**: Bloqueia qualquer ameaça potencial

E três políticas de segurança:

- **Padrão**: Política balanceada para a maioria dos casos
- **Alta Segurança**: Foco em prevenção de vazamentos e ataques
- **Performance**: Otimiza para latência mínima

## Documentação

Para documentação completa, consulte:

- [Guia de Uso](docs/Usage.md)
- [Configurações Avançadas](docs/Advanced.md)
- [Tratamento de Erros e Fallback](docs/error-handling.md)
- [API Remota (ShieldAPI)](docs/api-spec.yaml)

## Contribuição

Contribuições são bem-vindas! Consulte [CONTRIBUTING.md](docs/Contributing.md) para diretrizes.

## Licença

Este projeto é licenciado sob os termos da [Licença MIT](LICENSE).

## Suporte

Para suporte, entre em contato conosco em support@shieldgateway.io ou abra uma issue no GitHub. 
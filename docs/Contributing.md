# Guia de Contribuição

Obrigado pelo interesse em contribuir para o ShieldGateway! Este documento fornece diretrizes para contribuir com o projeto.

## Como Contribuir

### Reportando Bugs

1. Verifique se o bug já não foi reportado em [Issues](https://github.com/shield-gateway/n8n-nodes-shield-gateway/issues)
2. Use o template de bug para criar um novo issue
3. Inclua:
   - Descrição clara do problema
   - Passos para reproduzir
   - Comportamento esperado vs. atual
   - Capturas de tela (se aplicável)
   - Versões do ShieldGateway e n8n

### Sugerindo Melhorias

1. Verifique se a sugestão já não existe em [Issues](https://github.com/shield-gateway/n8n-nodes-shield-gateway/issues)
2. Use o template de feature para criar um novo issue
3. Descreva claramente a funcionalidade sugerida e seu caso de uso

### Desenvolvimento

#### Ambiente de Desenvolvimento

1. Clone o repositório:
```bash
git clone https://github.com/shield-gateway/n8n-nodes-shield-gateway.git
cd n8n-nodes-shield-gateway
```

2. Instale as dependências:
```bash
npm install
```

3. Configure o ambiente de desenvolvimento:
```bash
# Link para desenvolvimento local
npm link

# Em seu diretório n8n
cd ~/.n8n/custom
npm link n8n-nodes-shield-gateway
```

#### Fluxo de Trabalho

1. Crie um branch para sua feature/correção:
```bash
git checkout -b feature/nome-da-feature
```

2. Faça suas alterações seguindo as convenções de código

3. Execute os testes:
```bash
npm test
```

4. Faça commit das mudanças:
```bash
git commit -m "feat: adiciona nova funcionalidade"
```

5. Envie para o GitHub:
```bash
git push origin feature/nome-da-feature
```

6. Abra um Pull Request

### Convenções de Código

- Usamos TypeScript para todo o código
- Siga o estilo de código existente (formatação, espaçamento, etc.)
- Use nomes descritivos para variáveis e funções
- Inclua comentários JSDoc para funções públicas
- Use `async/await` em vez de callbacks ou promessas encadeadas

### Testes

- Inclua testes para novas funcionalidades
- Mantenha a cobertura de testes ≥ 80%
- Use mock para APIs externas

### Documentação

- Atualize a documentação para qualquer mudança na API pública
- Mantenha os exemplos de uso atualizados
- Use markdown corretamente

## Estrutura do Projeto

```
├── src/
│   ├── nodes/              # Implementação do nó n8n
│   ├── lib/
│   │   ├── guards/         # Implementações de proteção
│   │   ├── logging/        # Sistema de logging
│   │   ├── remote/         # Conexão com ShieldAPI
│   │   └── utils/          # Utilitários
│   └── index.ts            # Ponto de entrada
├── docs/                   # Documentação
├── tests/                  # Testes
└── package.json            # Dependências e scripts
```

## Processo de Release

1. O mantenedor principal revisará e mesclará os PRs
2. As versões seguem [Semantic Versioning](https://semver.org/)
3. Releases são publicados no npm
4. Anúncios são feitos no canal do Discord

## Código de Conduta

- Seja respeitoso e inclusivo
- Valorize diferentes pontos de vista
- Críticas construtivas são bem-vindas
- Foco em resolver problemas, não em culpar

## Reconhecimento

Contribuidores são reconhecidos em:
- Arquivo CONTRIBUTORS.md
- Notas de release
- Página do projeto

Obrigado por contribuir para o ShieldGateway! 
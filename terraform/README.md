# GuardAgent S3 WORM Bucket Setup

Este diretório contém a configuração Terraform para criar buckets S3 com Object-Lock para logging WORM do GuardAgent.

## 📋 Pré-requisitos

- [Terraform](https://terraform.io/downloads.html) >= 1.0
- [AWS CLI](https://aws.amazon.com/cli/) configurado
- Credenciais AWS com permissões para criar S3 buckets e IAM roles

## 🚀 Setup Rápido

### 1. Configurar credenciais AWS

```bash
# Via AWS CLI
aws configure

# Ou via variáveis de ambiente
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_REGION="us-east-1"
```

### 2. Criar bucket de desenvolvimento

```bash
cd terraform

# Inicializar Terraform
terraform init

# Planejar criação (dev)
terraform plan -var="environment=dev"

# Aplicar configuração
terraform apply -var="environment=dev"
```

### 3. Criar bucket de produção

```bash
# Planejar criação (prod) - com Object-Lock
terraform plan -var="environment=prod"

# Aplicar configuração
terraform apply -var="environment=prod"
```

## 📊 Recursos Criados

### Desenvolvimento (`environment=dev`)
- **Bucket**: `guardagent-dev-logs`
- **Versioning**: Habilitado
- **Encryption**: AES-256 (SSE-S3)
- **Object-Lock**: Desabilitado (para facilitar testes)

### Produção (`environment=prod`)
- **Bucket**: `guardagent-prod-logs`
- **Versioning**: Habilitado
- **Encryption**: AES-256 (SSE-S3)
- **Object-Lock**: COMPLIANCE mode, 365 dias
- **Retenção**: Imutável por 1 ano

## 🔧 Configuração da Aplicação

Após criar os buckets, configure as variáveis de ambiente:

```bash
# Para desenvolvimento
export WORM_BUCKET_NAME="guardagent-dev-logs"
export AWS_REGION="us-east-1"

# Para produção
export WORM_BUCKET_NAME="guardagent-prod-logs"
export AWS_REGION="us-east-1"
```

## 🧪 Testando o Setup

### 1. Verificar bucket criado

```bash
aws s3 ls | grep guardagent
```

### 2. Testar upload (dev)

```bash
echo '{"test": "log"}' > test-log.json
aws s3 cp test-log.json s3://guardagent-dev-logs/test/
```

### 3. Verificar Object-Lock (prod)

```bash
# Upload com retenção
aws s3api put-object \
  --bucket guardagent-prod-logs \
  --key test/test-lock.json \
  --body test-log.json \
  --object-lock-mode COMPLIANCE \
  --object-lock-retain-until-date "2025-12-31T23:59:59Z"

# Tentar deletar (deve falhar)
aws s3 rm s3://guardagent-prod-logs/test/test-lock.json
```

## 📋 Variáveis Terraform

| Variável | Descrição | Padrão | Obrigatória |
|----------|-----------|--------|-------------|
| `aws_region` | Região AWS | `us-east-1` | Não |
| `environment` | Ambiente (dev/prod) | `dev` | Não |
| `project_name` | Nome do projeto | `guardagent` | Não |

## 🔍 Verificação da Hash-Chain

Após configurar o bucket, use o script de verificação:

```bash
# Instalar dependências
npm install

# Verificar chain (últimos 100 registros)
node scripts/verify-chain.js

# Verificar com parâmetros customizados
node scripts/verify-chain.js --limit=50 --bucket=guardagent-dev-logs
```

## 🗑️ Limpeza

Para remover os recursos criados:

```bash
# Remover bucket dev
terraform destroy -var="environment=dev"

# Remover bucket prod (cuidado com Object-Lock!)
terraform destroy -var="environment=prod"
```

⚠️ **Atenção**: Buckets com Object-Lock em modo COMPLIANCE não podem ser deletados até que todos os objetos expirem!

## 📚 Referências

- [AWS S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html)
- [LGPD Art. 46 - Segurança](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)

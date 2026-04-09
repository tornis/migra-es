# Guia de Instalação - Elasticsearch Migration Tool

## Pré-requisitos

### 1. Node.js
Versão mínima: 18.0.0

```bash
# Verificar versão do Node.js
node --version

# Se necessário, instalar Node.js 18+
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# ou usando nvm
nvm install 18
nvm use 18
```

### 2. Redis
O Redis é necessário para cache e gerenciamento de filas.

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install redis-server

# Iniciar Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Verificar se está rodando
redis-cli ping
# Deve retornar: PONG
```

### 3. Elasticsearch
- Elasticsearch 5.x (origem)
- Elasticsearch 9.x (destino)

## Instalação do Projeto

### 1. Navegar até o diretório do projeto
```bash
cd /mnt/projetos/teste/migra-es
```

### 2. Instalar dependências
```bash
npm install
```

### 3. Configurar variáveis de ambiente
```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar configurações
nano .env  # ou use seu editor preferido
```

### 4. Criar diretórios necessários
```bash
mkdir -p logs data
```

## Configuração

### Arquivo .env

Edite o arquivo `.env` com suas configurações:

```bash
# Elasticsearch de Origem (ES5)
ES_SOURCE_URL=http://localhost:9200
ES_SOURCE_USER=elastic
ES_SOURCE_PASS=changeme
ES_SOURCE_SSL=false
ES_SOURCE_REJECT_UNAUTHORIZED=true

# Elasticsearch de Destino (ES9)
ES_DEST_URL=http://localhost:9201
ES_DEST_USER=elastic
ES_DEST_PASS=changeme
ES_DEST_SSL=false
ES_DEST_REJECT_UNAUTHORIZED=true

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Performance
BULK_SIZE=1000
WORKER_THREADS=4
SCROLL_SIZE=5000
SCROLL_TIMEOUT=5m
CACHE_TTL=3600

# Logging
LOG_LEVEL=info
LOG_DIR=./logs
```

## Verificação da Instalação

### 1. Verificar Redis
```bash
redis-cli ping
```

### 2. Verificar Elasticsearch de Origem
```bash
curl http://localhost:9200
```

### 3. Verificar Elasticsearch de Destino
```bash
curl http://localhost:9201
```

### 4. Testar a aplicação
```bash
npm start
```

## Problemas Comuns

### Redis não está rodando
```bash
# Verificar status
sudo systemctl status redis-server

# Iniciar Redis
sudo systemctl start redis-server
```

### Porta já em uso
```bash
# Verificar processos usando a porta
sudo lsof -i :6379  # Redis
sudo lsof -i :9200  # Elasticsearch origem
sudo lsof -i :9201  # Elasticsearch destino
```

### Permissões de arquivo
```bash
# Dar permissão de execução
chmod +x src/cli/index.js

# Ajustar permissões dos diretórios
chmod 755 logs data
```

### Erro de módulo não encontrado
```bash
# Limpar cache do npm e reinstalar
rm -rf node_modules package-lock.json
npm install
```

## Instalação Global (Opcional)

Para usar o comando `es-migrate` globalmente:

```bash
npm link
```

Agora você pode executar de qualquer lugar:
```bash
es-migrate
```

## Desinstalação

```bash
# Remover link global (se instalado)
npm unlink

# Remover dependências
rm -rf node_modules

# Remover dados e logs
rm -rf data logs
```

## Próximos Passos

Após a instalação bem-sucedida:

1. Leia o [README.md](README.md) para entender o uso
2. Execute `npm start` para iniciar a aplicação
3. Siga o wizard interativo para configurar sua primeira migração

## Suporte

Se encontrar problemas durante a instalação:

1. Verifique os logs em `logs/application-*.log`
2. Certifique-se de que todas as dependências estão instaladas
3. Verifique as versões do Node.js e Redis
4. Confirme que os servidores Elasticsearch estão acessíveis

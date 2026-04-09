# Guia Rápido de Início

## Início Rápido em 5 Minutos

### 1. Pré-requisitos
Certifique-se de ter instalado:
- ✅ Node.js 18+
- ✅ Redis
- ✅ Elasticsearch 5.x (origem)
- ✅ Elasticsearch 9.x (destino)

### 2. Instalação
```bash
cd /mnt/projetos/teste/migra-es
npm install
```

### 3. Configuração
```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar com suas configurações
nano .env
```

Configuração mínima necessária:
```bash
ES_SOURCE_URL=http://localhost:9200
ES_DEST_URL=http://localhost:9201
REDIS_HOST=localhost
```

### 4. Iniciar Redis
```bash
# Verificar se Redis está rodando
redis-cli ping

# Se não estiver, iniciar:
sudo systemctl start redis-server
```

### 5. Executar a Aplicação
```bash
npm start
```

### 6. Seguir o Wizard
1. **Configurar Origem**
   - Informe URL do Elasticsearch 5
   - Configure autenticação (se necessário)
   - Configure SSL (se necessário)

2. **Configurar Destino**
   - Informe URL do Elasticsearch 9
   - Configure autenticação (se necessário)
   - Configure SSL (se necessário)

3. **Selecionar Índice**
   - Escolha o índice a ser migrado

4. **Selecionar Campo de Controle**
   - Escolha um campo numérico ou de data
   - Recomendado: timestamp ou ID

5. **Monitorar Progresso**
   - Acompanhe a migração em tempo real
   - Veja estatísticas e progresso

## Comandos Úteis

### Durante a Migração
- `P` - Pausar migração
- `R` - Retomar migração
- `C` - Cancelar migração
- `Q` - Fechar monitor

### Navegação
- `↑↓` - Navegar em listas
- `Enter` - Selecionar opção
- `ESC` - Cancelar/Voltar
- `Q` - Sair da aplicação

## Verificação Rápida

### Testar Conexões
```bash
# Elasticsearch Origem
curl http://localhost:9200

# Elasticsearch Destino
curl http://localhost:9201

# Redis
redis-cli ping
```

### Ver Logs
```bash
# Logs em tempo real
tail -f logs/application-*.log

# Apenas erros
tail -f logs/error-*.log
```

## Exemplo Completo

### Cenário: Migrar índice "products"

1. **Iniciar**
```bash
npm start
```

2. **Wizard**
   - Origem: `http://localhost:9200` (sem auth, sem SSL)
   - Destino: `http://localhost:9201` (sem auth, sem SSL)
   - Índice: `products`
   - Campo: `created_at`

3. **Aguardar**
   - A migração inicia automaticamente
   - Progresso é exibido em tempo real
   - Pode fechar e reabrir a TUI sem perder progresso

4. **Validar**
```bash
# Comparar contagem de documentos
curl http://localhost:9200/products/_count
curl http://localhost:9201/products/_count
```

## Solução de Problemas Rápida

### Redis não conecta
```bash
sudo systemctl start redis-server
```

### Elasticsearch não conecta
```bash
# Verificar se está rodando
curl http://localhost:9200
curl http://localhost:9201
```

### Erro de permissão
```bash
chmod +x src/cli/index.js
```

### Limpar dados antigos
```bash
rm -rf data/tasks.json logs/*.log
```

## Próximos Passos

- 📖 Leia [README.md](README.md) para documentação completa
- 🔧 Veja [INSTALL.md](INSTALL.md) para instalação detalhada
- 📝 Consulte [EXAMPLES.md](EXAMPLES.md) para mais exemplos

## Suporte

Problemas? Verifique:
1. Logs em `logs/application-*.log`
2. Redis está rodando: `redis-cli ping`
3. Elasticsearch acessível: `curl http://localhost:9200`
4. Versão do Node.js: `node --version` (deve ser 18+)

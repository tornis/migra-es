# Exemplos de Uso

## Exemplo 1: Migração Básica

### Cenário
Migrar um índice de produtos do ES5 para ES9.

### Configuração
- **Origem**: ES5 em `http://localhost:9200`
- **Destino**: ES9 em `http://localhost:9201`
- **Índice**: `products`
- **Campo de Controle**: `created_at` (timestamp)

### Passos

1. Iniciar a aplicação:
```bash
npm start
```

2. Selecionar "Nova Migração"

3. Configurar origem:
   - URL: `http://localhost:9200`
   - Autenticação: Não
   - SSL: Não

4. Configurar destino:
   - URL: `http://localhost:9201`
   - Autenticação: Não
   - SSL: Não

5. Selecionar índice: `products`

6. Selecionar campo de controle: `created_at`

7. Aguardar a migração completar

## Exemplo 2: Migração com Autenticação e SSL

### Cenário
Migrar índice de logs com autenticação e SSL habilitado.

### Configuração
- **Origem**: ES5 em `https://es5.example.com:9200`
  - Usuário: `admin`
  - Senha: `secret123`
  - SSL: Sim
  - Verificar certificado: Não (self-signed)
- **Destino**: ES9 em `https://es9.example.com:9200`
  - Usuário: `admin`
  - Senha: `secret456`
  - SSL: Sim
  - Verificar certificado: Sim

### Passos

1. Configurar `.env`:
```bash
ES_SOURCE_URL=https://es5.example.com:9200
ES_SOURCE_USER=admin
ES_SOURCE_PASS=secret123
ES_SOURCE_SSL=true
ES_SOURCE_REJECT_UNAUTHORIZED=false

ES_DEST_URL=https://es9.example.com:9200
ES_DEST_USER=admin
ES_DEST_PASS=secret456
ES_DEST_SSL=true
ES_DEST_REJECT_UNAUTHORIZED=true
```

2. Executar migração normalmente

## Exemplo 3: Migração de Grande Volume

### Cenário
Migrar índice com 10 milhões de documentos.

### Otimizações

1. Ajustar `.env` para performance:
```bash
BULK_SIZE=5000
WORKER_THREADS=8
SCROLL_SIZE=10000
SCROLL_TIMEOUT=10m
CACHE_TTL=7200
```

2. Aumentar heap do Elasticsearch:
```bash
# No elasticsearch.yml
-Xms4g
-Xmx4g
```

3. Usar campo numérico como controle (mais rápido que timestamp):
   - Campo: `id` (long)

4. Monitorar recursos:
```bash
# Terminal 1: Aplicação
npm start

# Terminal 2: Logs
tail -f logs/application-*.log

# Terminal 3: Redis
redis-cli monitor

# Terminal 4: Sistema
htop
```

## Exemplo 4: Retomar Migração Interrompida

### Cenário
Migração foi interrompida e precisa ser retomada.

### Passos

1. Iniciar a aplicação:
```bash
npm start
```

2. Na tela inicial, você verá a migração pausada/falhada

3. Selecionar a migração da lista

4. Pressionar `R` para retomar

A migração continuará do último checkpoint salvo.

## Exemplo 5: Migração com Mapping Complexo

### Cenário
Índice com mapping ES5 complexo incluindo:
- Campos `string` (deprecated)
- `_all` field
- Analyzers customizados
- Nested objects

### Mapping ES5 Original
```json
{
  "mappings": {
    "product": {
      "_all": { "enabled": true },
      "properties": {
        "name": {
          "type": "string",
          "index": "analyzed",
          "analyzer": "standard"
        },
        "sku": {
          "type": "string",
          "index": "not_analyzed"
        },
        "description": {
          "type": "string",
          "analyzer": "snowball"
        },
        "tags": {
          "type": "string",
          "index": "analyzed"
        },
        "price": {
          "type": "double"
        },
        "created_at": {
          "type": "date",
          "format": "YYYY-MM-DD HH:mm:ss"
        }
      }
    }
  }
}
```

### Mapping ES9 Convertido (Automático)
```json
{
  "mappings": {
    "properties": {
      "name": {
        "type": "text",
        "analyzer": "standard",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "sku": {
        "type": "keyword"
      },
      "description": {
        "type": "text",
        "analyzer": "custom_stemmer"
      },
      "tags": {
        "type": "text",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          }
        }
      },
      "price": {
        "type": "double"
      },
      "created_at": {
        "type": "date",
        "format": "yyyy-MM-dd HH:mm:ss"
      }
    }
  }
}
```

A conversão é feita automaticamente pela ferramenta!

## Exemplo 6: Múltiplas Migrações Simultâneas

### Cenário
Migrar vários índices em paralelo.

### Passos

1. Iniciar primeira migração:
   - Índice: `products`
   - Campo: `id`

2. Abrir novo terminal e iniciar segunda migração:
```bash
npm start
```
   - Índice: `orders`
   - Campo: `order_date`

3. Abrir terceiro terminal para terceira migração:
```bash
npm start
```
   - Índice: `customers`
   - Campo: `customer_id`

Cada migração roda em background e pode ser monitorada independentemente.

## Exemplo 7: Migração com Validação

### Cenário
Validar dados após migração.

### Passos

1. Executar migração normalmente

2. Após conclusão, validar contagem:
```bash
# Origem
curl -X GET "http://localhost:9200/products/_count"

# Destino
curl -X GET "http://localhost:9201/products/_count"
```

3. Validar mapping:
```bash
# Destino
curl -X GET "http://localhost:9201/products/_mapping"
```

4. Validar alguns documentos:
```bash
# Buscar documento específico
curl -X GET "http://localhost:9201/products/_doc/1"
```

## Exemplo 8: Tratamento de Erros

### Cenário
Alguns documentos falharam durante a migração.

### Análise

1. Verificar logs:
```bash
grep "ERROR" logs/application-*.log
```

2. Verificar contador de falhas no monitor

3. Documentos com erro são logados com detalhes

4. Opções:
   - Corrigir dados na origem e remigrar
   - Indexar documentos falhados manualmente
   - Ignorar se quantidade for insignificante

## Dicas de Performance

### Para Índices Pequenos (< 1M docs)
```bash
BULK_SIZE=1000
WORKER_THREADS=2
SCROLL_SIZE=5000
```

### Para Índices Médios (1M - 10M docs)
```bash
BULK_SIZE=3000
WORKER_THREADS=4
SCROLL_SIZE=10000
```

### Para Índices Grandes (> 10M docs)
```bash
BULK_SIZE=5000
WORKER_THREADS=8
SCROLL_SIZE=15000
CACHE_TTL=7200
```

## Monitoramento

### Ver progresso em tempo real
A TUI mostra automaticamente:
- Percentual de conclusão
- Documentos processados
- Taxa de transferência (docs/s)
- Tempo estimado

### Logs detalhados
```bash
# Seguir logs em tempo real
tail -f logs/application-*.log

# Filtrar apenas erros
tail -f logs/error-*.log

# Buscar por índice específico
grep "products" logs/application-*.log
```

### Monitorar Redis
```bash
# Conectar ao Redis
redis-cli

# Ver todas as chaves
KEYS *

# Ver informações de memória
INFO memory

# Monitorar comandos
MONITOR
```

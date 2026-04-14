# IndexBridge

TUI (Terminal UI) para migração perfeita de índices entre Elasticsearch e OpenSearch, com análise de impacto assistida por IA.

---

## Visão geral

**IndexBridge** é uma ferramenta de linha de comando interativa que automatiza a migração de índices entre versões incompatíveis e entre diferentes plataformas (Elasticsearch ↔ OpenSearch). A migração entre ES5 e ES9, ou a transição de Elasticsearch para OpenSearch (e vice-versa) envolve mudanças profundas em mapeamentos, analyzers, configurações e APIs — o IndexBridge cuida de tudo isso com um fluxo guiado passo a passo.

Quando configurado com um provedor de IA (Claude, OpenAI, Gemini ou endpoint compatível), o IndexBridge analisa cada índice antes de migrá-lo, gera um relatório de impacto detalhado e propõe mapeamentos, settings e analyzers otimizados para a plataforma e versão alvo. O usuário aprova ou rejeita cada proposta antes de qualquer dado ser movido.

---

## Funcionalidades

- **TUI interativa** — interface no terminal com navegação por teclado (construída com [Ink](https://github.com/vadimdemedes/ink))
- **Migração com scroll + Bull queue** — usa scroll API do ES5 com processamento em fila Redis para alta resiliência
- **Suporte cross-platform** — migração contínua entre Elasticsearch e OpenSearch, com detecção automática de plataforma
- **Conversão automática de mapeamentos** — converte tipos entre plataformas (ES5 `string` → ES9 `text`/`keyword`; `dense_vector` ↔ `knn_vector` para busca vetorial)
- **Conversão de analyzers** — adapta analyzers e token filters depreciados para equivalentes da versão alvo
- **Migração de campos vetoriais** — conversão inteligente de campos de busca vetorial entre `dense_vector` (Elasticsearch) e `knn_vector` (OpenSearch)
- **Análise de impacto com IA** — pipeline de análise em duas fases por índice; relatórios gerados no idioma configurado (pt-BR ou English)
- **Proposta revisável** — mapeamento, settings, analyzers, template e aliases gerados pela IA são exibidos para aprovação antes da execução
- **Cache de breaking changes** — guia de mudanças gerado pela IA é persistido localmente por dupla de versão, evitando chamadas redundantes
- **Multi-provedor** — suporta Claude (Anthropic), OpenAI, Google Gemini e qualquer endpoint compatível com OpenAI
- **Internacionalização** — interface e relatórios disponíveis em Português (pt-BR) e Inglês

---

## Pré-requisitos

- Node.js >= 18
- Redis rodando localmente (ou acessível via rede)
- Source: Elasticsearch 5.x / 9.x ou OpenSearch 1.x / 2.x / 3.x
- Destino: Elasticsearch 9.x ou OpenSearch 1.x / 2.x / 3.x (acessível)

---

## Instalação

```bash
git clone <repo>
cd indexbridge
npm install
cp .env.example .env
```

Edite o `.env` com as configurações mínimas:

```env
ES_SOURCE_URL=http://localhost:9200   # Source: Elasticsearch ou OpenSearch
ES_DEST_URL=http://localhost:9201     # Destino: Elasticsearch ou OpenSearch
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

**Nota:** A detecção de plataforma é automática — a ferramenta detecta se cada endpoint é Elasticsearch ou OpenSearch e adapta a estratégia de migração accordingly.

---

## Uso

```bash
# Iniciar a TUI
npm start

# Modo desenvolvimento (recarrega automaticamente)
npm run dev
```

### Navegação no dashboard (tela Home)

| Tecla | Ação |
|-------|------|
| `N` | Nova migração (abre o wizard) |
| `A` | Configurar provedor de IA |
| `I` | Análise de impacto |
| `B` | Cache de breaking changes |
| `Enter` | Abrir tarefa selecionada |
| `↑ / ↓` | Navegar na lista de tarefas |

---

## Fluxo de migração com análise de IA

```
Wizard
  └─ Configuração source/dest
  └─ Seleção de índice
  └─ Campo de controle (cursor de checkpoint)
  └─ Confirmação
        │
        ├─ [IA configurada] → Proposal Runner
        │     └─ Análise por índice (streaming)
        │     └─ Proposta: mapeamento + settings + analyzers + relatório
        │
        ├─ [IA configurada] → Proposal Review
        │     └─ Aprovação ou rejeição por índice
        │     └─ Drill-down em abas: Relatório / Mapeamento / Settings / Estratégia
        │
        └─ Migration Engine
              └─ [com IA] usa artifacts da proposta aprovada
              └─ [sem IA]  usa auto-conversores de mapeamento/analyzer
              └─ Scroll source → Bulk index dest
```

---

## Como a IA analisa cada índice

A análise de impacto ocorre em **duas fases** para cada índice, antes de qualquer dado ser movido.

### Fase 1 — Breaking changes

O módulo `breakingChangesMemory` verifica se já existe um guia de breaking changes em cache local (`~/.migra-es/breaking-changes-memory.json`). As chaves de cache são separadas por dupla de versão (ex.: `ES:5→9`, `OS:2→3`, `ES→OS`) para suportar migrações intra-versão e cross-platform. Se não existir, envia uma query ao modelo de IA pedindo uma lista estruturada de mudanças incompatíveis entre as versões/plataformas. O resultado é salvo localmente e reutilizado em análises futuras — evitando chamadas desnecessárias à API.

### Fase 2 — Proposta por índice

Com o contexto de breaking changes em mãos, o módulo `migrationProposal` envia ao modelo:

- O mapeamento atual do índice (plataforma/versão source)
- As settings atuais (analyzers, filtros, shards, réplicas)
- O guia de breaking changes da fase 1
- Contexto de campos vetoriais (se presentes) para conversão inteligente de `dense_vector` ↔ `knn_vector`
- Contexto cross-platform (se migrando entre ES e OpenSearch)
- Uma instrução de idioma (`langInstruction()`) para que o relatório seja gerado no idioma configurado no app

O modelo responde em **streaming** com uma proposta estruturada contendo:

| Campo | Conteúdo |
|-------|----------|
| `mapping` | Mapeamento convertido para plataforma/versão alvo |
| `settings` | Settings otimizadas para plataforma/versão alvo |
| `analyzers` | Analyzers e token filters compatíveis |
| `template` | Template de índice sugerido |
| `aliases` | Aliases recomendados |
| `report` | Relatório narrativo explicando cada decisão tomada |
| `strategy` | Estratégia de migração (ex.: reindex, rollover, zero-downtime) |
| `vectorFieldsConverted` | Flag booleano indicando se campos vetoriais foram convertidos |

### Artifacts e aprovação

Cada proposta é salva como um arquivo JSON em `~/.migra-es/indices/{indexName}/proposal.json`. O usuário revisa a proposta na tela **Proposal Review** — pode navegar pelas abas (Relatório / Mapeamento / Settings+Analyzers / Estratégia) e aprovar ou rejeitar cada índice individualmente. Para migrações cross-platform, o wizard exibe um banner de alerta indicando as plataformas source e destino.

Somente os índices aprovados avançam para execução. Ao executar, o **Migration Engine** lê o artifact salvo e usa os dados da proposta para criar o índice destino, adaptando automaticamente:
- Settings para a plataforma alvo (ex.: removendo settings X-Pack do Elasticsearch para OpenSearch)
- Configurações de campos vetoriais (ex.: injetando `index.knn: true` para campos knn_vector do OpenSearch)

Se nenhum artifact existir (fluxo sem IA), usa os auto-conversores.

---

## Configuração do provedor de IA

Acesse a tela **AI Config** (`A` no dashboard) ou configure diretamente em `~/.migra-es/ai-config.json`:

```json
{
  "provider": "claude",
  "model": "claude-sonnet-4-6",
  "apiKey": "sk-ant-..."
}
```

Provedores suportados:

| Provedor | Valor | Modelos recomendados |
|----------|-------|----------------------|
| Anthropic Claude | `claude` | `claude-sonnet-4-6`, `claude-opus-4-6` |
| OpenAI | `openai` | `gpt-4o`, `gpt-4-turbo` |
| Google Gemini | `gemini` | `gemini-1.5-pro` |
| Custom (OpenAI-compat.) | `custom` | qualquer modelo local (Ollama, LM Studio, etc.) |

Para provedores custom, inclua também `"baseUrl": "http://localhost:11434/v1"`.

---

## Arquivos e diretórios gerados

| Caminho | Conteúdo |
|---------|----------|
| `data/tasks.json` | Estado persistido das tarefas de migração (LowDB) |
| `logs/application-*.log` | Logs gerais da aplicação (Winston) |
| `logs/error-*.log` | Logs de erros |
| `~/.migra-es/ai-config.json` | Configuração do provedor de IA |
| `~/.migra-es/breaking-changes-memory.json` | Cache de breaking changes gerado pela IA (multi-versão, multi-plataforma) |
| `~/.migra-es/indices/{nome}/proposal.json` | Proposta de migração por índice com detalhes cross-platform |

---

## Comandos úteis

```bash
# Ver logs em tempo real
tail -f logs/application-*.log

# Limpar estado das tarefas
rm data/tasks.json

# Verificar Redis
redis-cli ping

# Limpar todo o cache de breaking changes (incluindo cross-platform e multi-versão)
rm ~/.migra-es/breaking-changes-memory.json

# Limpar proposta de um índice específico
rm ~/.migra-es/indices/meu-indice/proposal.json

# Visualizar todas as propostas salvas
ls -la ~/.migra-es/indices/
```

---

## Arquitetura resumida

```
src/
├── cli/
│   ├── index.jsx                     # App root + state machine de telas
│   ├── wizard.jsx                    # Wizard multi-step + roteamento IA
│   └── components/
│       ├── TaskList.jsx              # Dashboard / home
│       ├── AIProviderSelector.jsx    # Configuração do provedor de IA
│       ├── ImpactAnalysisView.jsx    # Análise de impacto (streaming)
│       ├── BreakingChangesMemoryView # Gestão do cache de breaking changes
│       ├── MigrationProposalRunner   # Análise sequencial por índice
│       ├── MigrationProposalReview   # Aprovação/rejeição de propostas
│       └── IndexProposalDetail       # Detalhe em abas de uma proposta
├── core/
│   ├── ai/
│   │   ├── aiConfig.js              # Leitura/escrita da config de IA
│   │   ├── aiClient.js              # Factory de provedores
│   │   ├── providers/               # claude, openai, gemini, custom
│   │   ├── breakingChangesMemory.js # Cache persistente de breaking changes
│   │   ├── impactAnalyzer.js        # Pipeline de análise em duas fases
│   │   ├── indexArtifacts.js        # CRUD de artifacts por índice
│   │   └── migrationProposal.js     # Geração da proposta com i18n
│   ├── elasticsearch/
│   │   ├── client.js                # Cria clients ES/OpenSearch com suporte SSL/auth
│   │   ├── engineDetector.js        # Auto-detecta Elasticsearch vs OpenSearch; helpers cross-platform
│   │   ├── indexManager.js          # getIndexMapping, getIndexSettings, createIndex, etc.
│   │   ├── bulkOperations.js        # bulkIndex, getFieldRange
│   │   └── legacyClient.js          # HTTP client para compatibilidade com ES5
│   ├── migration/
│   │   ├── mappingConverter.js      # Converte mapeamentos ES5→ES9, campos vetoriais (dense_vector ↔ knn_vector)
│   │   ├── analyzerConverter.js     # Adapta analyzers/filtros para versão alvo
│   │   └── migrationEngine.js       # Orquestra migração: scroll source → bulk index dest
│   ├── tasks/
│   │   ├── taskManager.js           # CRUD para tarefas de migração
│   │   └── queue.js                 # Processador de fila Bull
│   └── cache/
│       ├── redisClient.js           # Singleton de conexão ioredis
│       └── cacheStrategy.js         # Cache de mapeamentos/settings de índice
├── i18n/locales/                    # en.json, pt-BR.json
└── utils/                           # config, logger, validators
```

---

## Migração cross-platform: Elasticsearch ↔ OpenSearch

IndexBridge suporta migrações contínuas entre Elasticsearch e OpenSearch, incluindo:

- **Auto-detecção**: O wizard detecta automaticamente se cada endpoint é Elasticsearch ou OpenSearch através do campo `/` endpoint's `version.distribution`.
- **Conversão de campos vetoriais**: Converte automaticamente entre campos `dense_vector` (Elasticsearch) e `knn_vector` (OpenSearch), ajustando settings e parâmetros apropriadamente.
- **Breaking changes cientes de versão**: O cache de breaking changes é chaveado por dupla plataforma/versão (ex.: `ES:5→9`, `OS:2→3`, `ES→OS`), então migrações se beneficiam de guidance em cache independente da direção.
- **Settings cientes de plataforma**: O migration engine sanitiza automaticamente settings para a plataforma alvo (ex.: removendo campos X-Pack-específicos ao migrar para OpenSearch).
- **Geração de proposta ciente de engine**: Propostas geradas por IA incluem contexto cross-platform, garantindo que recomendações levem em conta capacidades específicas da plataforma (ex.: suporte nativo a busca vetorial do OpenSearch).
- **Indicador de UI cross-solution**: O wizard exibe um banner em cyan ao migrar entre diferentes plataformas, tornando clara a natureza cross-platform da operação.

---

## Decisões de design-chave

- **Suporte cross-platform de cliente**: O SDK `@elastic/elasticsearch` v8 é usado tanto para Elasticsearch quanto para OpenSearch (via modo compatibilidade). `engineDetector.js` envolve chamadas de client para lidar com peculiaridades específicas de plataforma.
- **Detecção de engine**: O wizard chama `detectEngine()` após testar cada conexão, embutindo o tipo de engine na config de conexão para uso por todos os componentes downstream.
- **Campo de controle**: Um campo ordenável (numérico ou data) usado como cursor de scroll/checkpoint para retomar migrações interrompidas.
- **Propostas de IA**: Quando um provedor de IA é configurado, o wizard gera uma proposta por índice antes da migração. Propostas são salvas em `~/.migra-es/indices/{indexName}/proposal.json`.
- **Cache de breaking changes**: Chaves de cache separadas por engine habilitam reutilização entre migrações intra-versão e cross-platform, reduzindo chamadas de API de IA.
- **Idioma do relatório de IA**: `migrationProposal.js` chama `langInstruction()` da locale i18n ativa, garantindo que todos os relatórios correspondam ao idioma configurado da app (pt-BR ou English).
- **Persistência**: Estado de tarefa é armazenado em `data/tasks.json` via LowDB; propostas de IA em `~/.migra-es/indices/`; configuração em `~/.migra-es/ai-config.json`.

# migra-es

TUI (Terminal UI) para migração de índices do Elasticsearch 5 para o Elasticsearch 9, com análise de impacto assistida por IA.

---

## Visão geral

**migra-es** é uma ferramenta de linha de comando interativa que automatiza a migração de índices entre versões incompatíveis do Elasticsearch. A migração entre ES5 e ES9 envolve mudanças profundas em mapeamentos, analyzers, configurações e APIs — o migra-es cuida de tudo isso com um fluxo guiado passo a passo.

Quando configurado com um provedor de IA (Claude, OpenAI, Gemini ou endpoint compatível), o migra-es analisa cada índice antes de migrá-lo, gera um relatório de impacto detalhado e propõe mapeamentos, settings e analyzers otimizados para ES9. O usuário aprova ou rejeita cada proposta antes de qualquer dado ser movido.

---

## Funcionalidades

- **TUI interativa** — interface no terminal com navegação por teclado (construída com [Ink](https://github.com/vadimdemedes/ink))
- **Migração com scroll + Bull queue** — usa scroll API do ES5 com processamento em fila Redis para alta resiliência
- **Conversão automática de mapeamentos** — converte tipos ES5 (`string` → `text`/`keyword`) e remove campos obsoletos (`_all`, `_timestamp`, `include_in_all`)
- **Conversão de analyzers** — adapta analyzers e token filters depreciados para equivalentes ES9
- **Análise de impacto com IA** — pipeline de análise em duas fases por índice; relatórios gerados no idioma configurado (pt-BR ou English)
- **Proposta revisável** — mapeamento, settings, analyzers, template e aliases gerados pela IA são exibidos para aprovação antes da execução
- **Cache de breaking changes** — guia de mudanças entre versões gerado pela IA é persistido localmente para evitar chamadas redundantes
- **Multi-provedor** — suporta Claude (Anthropic), OpenAI, Google Gemini e qualquer endpoint compatível com OpenAI
- **Internacionalização** — interface e relatórios disponíveis em Português (pt-BR) e Inglês

---

## Pré-requisitos

- Node.js >= 18
- Redis rodando localmente (ou acessível via rede)
- Elasticsearch 5.x (source) acessível
- Elasticsearch 9.x (dest) acessível

---

## Instalação

```bash
git clone <repo>
cd migra-es
npm install
cp .env.example .env
```

Edite o `.env` com as configurações mínimas:

```env
ES_SOURCE_URL=http://localhost:9200   # URL do ES5
ES_DEST_URL=http://localhost:9201     # URL do ES9
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

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

O módulo `breakingChangesMemory` verifica se já existe um guia de breaking changes ES5→ES9 em cache local (`~/.migra-es/breaking-changes-memory.json`). Se não existir, envia uma query ao modelo de IA pedindo uma lista estruturada de mudanças incompatíveis entre as versões. O resultado é salvo localmente e reutilizado em análises futuras — evitando chamadas desnecessárias à API.

### Fase 2 — Proposta por índice

Com o contexto de breaking changes em mãos, o módulo `migrationProposal` envia ao modelo:

- O mapeamento atual do índice (ES5)
- As settings atuais (analyzers, filtros, shards, réplicas)
- O guia de breaking changes da fase 1
- Uma instrução de idioma (`langInstruction()`) para que o relatório seja gerado no idioma configurado no app

O modelo responde em **streaming** com uma proposta estruturada contendo:

| Campo | Conteúdo |
|-------|----------|
| `mapping` | Mapeamento convertido para ES9 |
| `settings` | Settings otimizadas para ES9 |
| `analyzers` | Analyzers e token filters compatíveis |
| `template` | Template de índice sugerido |
| `aliases` | Aliases recomendados |
| `report` | Relatório narrativo explicando cada decisão tomada |
| `strategy` | Estratégia de migração (ex.: reindex, rollover, zero-downtime) |

### Artifacts e aprovação

Cada proposta é salva como um arquivo JSON em `~/.migra-es/indices/{indexName}/proposal.json`. O usuário revisa a proposta na tela **Proposal Review** — pode navegar pelas abas (Relatório / Mapeamento / Settings+Analyzers / Estratégia) e aprovar ou rejeitar cada índice individualmente.

Somente os índices aprovados avançam para execução. Ao executar, o **Migration Engine** lê o artifact salvo e usa os dados da proposta para criar o índice destino. Se nenhum artifact existir (fluxo sem IA), usa os auto-conversores.

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
| `~/.migra-es/breaking-changes-memory.json` | Cache de breaking changes gerado pela IA |
| `~/.migra-es/indices/{nome}/proposal.json` | Proposta de migração por índice |

---

## Comandos úteis

```bash
# Ver logs em tempo real
tail -f logs/application-*.log

# Limpar estado das tarefas
rm data/tasks.json

# Verificar Redis
redis-cli ping

# Limpar cache de breaking changes
rm ~/.migra-es/breaking-changes-memory.json

# Limpar proposta de um índice específico
rm ~/.migra-es/indices/meu-indice/proposal.json
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
│   ├── elasticsearch/               # Clients, indexManager, bulkOperations
│   ├── migration/                   # mappingConverter, analyzerConverter, migrationEngine
│   ├── tasks/                       # taskManager, queue (Bull)
│   └── cache/                       # redisClient, cacheStrategy
├── i18n/locales/                    # en.json, pt-BR.json
└── utils/                           # config, logger, validators
```

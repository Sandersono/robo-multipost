# AGENTS.md

> **Single source of truth for any AI agent working in this repo:** [`CLAUDE.md`](CLAUDE.md).

The root `CLAUDE.md` points to per-area child `CLAUDE.md` files
(`apps/backend`, `apps/frontend`, `apps/orchestrator`,
`libraries/nestjs-libraries` and its children `ai/`, `chat/`,
`integrations/social/`, and `libraries/react-shared-libraries`). Agents
should read the closest `CLAUDE.md` to the directory they are working in,
cascading up to the root.

All `CLAUDE.md` files in this repo are written in English (the agent
reads them better that way). Product-facing artifacts (CHANGELOG,
docs/, translations) stay in pt-BR per project convention.

- **Browser validation**: Claude in Chrome enabled — see
  [`CLAUDE.md > Browser Validation`](CLAUDE.md#browser-validation-claude-in-chrome).
- **Code graph**: `graphify-out/` indexes the monorepo as a queryable knowledge graph — see
  [`CLAUDE.md > Code Graph (Graphify)`](CLAUDE.md#code-graph-graphify).

Product and architecture documentation lives in [`docs/`](docs/),
referenced by the `CLAUDE.md` files but not the same thing.

## Memória do projeto

Decisões, armadilhas e contexto acumulado vivem fora do repo, em `C:\Dev\memoria\` (git privado, compartilhado entre Claude, Codex e outros agentes).

- No início da sessão, leia `C:\Dev\memoria\multipost\MEMORY.md` (índice) e abra só as memórias relevantes. Preferências gerais estão em `C:\Dev\memoria\_geral\`.
- Uma decisão com porquê, um defeito medido ou uma regra nova: grave como memória seguindo `C:\Dev\memoria\README.md` e faça commit e push lá (o remoto é o repositório privado `Sandersono/memoria`; sem push, a memória fica só nesta máquina).
- Memória diz o que era verdade quando foi escrita: se citar arquivo, função ou flag, confira que ainda existe antes de agir.

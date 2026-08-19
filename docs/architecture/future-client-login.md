# Client Login (Fase Futura)

> **Estado (2026-08): a maior parte disto já existe — via `VIEWER`, não via um papel `CLIENT`.**
>
> Um cliente convidado como org `USER` + perfil `VIEWER` já loga restrito ao próprio
> perfil, não vê os demais clientes nem Configurações, e aprova/comenta post in-app
> (`POST /posts/:id/review`, liberado ao Visualizador por `@AllowViewer`). A casca
> reduzida está em `apps/frontend/src/components/layout/top.menu.tsx`, no gate
> `isViewer` — que esconde tudo menos o Calendário.
>
> O que a tabela de restrições abaixo pedia está atendido, com uma diferença de
> desenho: **não há área `/client` separada**; é o mesmo layout com o menu reduzido.
>
> **O único gap real:** cliente que também precisa *criar e agendar* post. `VIEWER`
> é somente-leitura; `EDITOR` escreve mas recebe o menu completo (escopado ao perfil
> dele — não vaza outro cliente, só mostra mais superfície do que um cliente precisa).
> Enquanto o papel `CLIENT` não existir, o caminho é promover `VIEWER → EDITOR` em
> Configurações → Perfis.
>
> **Nunca** resolver isso dando org `ADMIN` ao cliente: admin tem acesso implícito a
> TODOS os perfis (`ProfileAccessGuard` e `getAccessibleProfiles`), o que derruba o
> isolamento inteiro. Ver a golden rule em [`CLAUDE.md`](../../CLAUDE.md).
>
> Se um dia o `CLIENT` for construído, o escopo real é pequeno (~6-8 arquivos):
> enum, guard tratando `CLIENT` como quem escreve, separar no `use-profile-permissions`
> os conceitos hoje unificados de "quem escreve" e "quem vê a casca reduzida", trocar
> o gate do menu, e permitir escolher o papel no convite.

## Objetivo

Permitir que clientes de agencias acessem o Robo MultiPost com visao restrita ao seu perfil, sem ver dados de outros clientes ou configuracoes da agencia.

## Modelo Proposto

### Nova Role: ProfileRole.CLIENT

Adicionar `CLIENT` ao enum `ProfileRole`:

```prisma
enum ProfileRole {
  OWNER
  MANAGER
  EDITOR
  VIEWER
  CLIENT    // Nova role
}
```

### Fluxo de Autenticacao

1. **Convite por email** — O OWNER/MANAGER do profile envia convite via `POST /profiles/:id/invite`
2. **Registro/login** — Cliente cria conta ou loga com conta existente
3. **Associacao** — Sistema cria `ProfileMember` com role `CLIENT`
4. **Redirect** — Apos login, cliente e redirecionado automaticamente ao seu profile

### Restricoes do CLIENT

| Recurso | Acesso |
|---------|--------|
| Posts do perfil | Leitura + aprovacao |
| Media do perfil | Leitura |
| Analytics do perfil | Leitura |
| Integracoes | Apenas visualizar (nao conectar/desconectar) |
| Configuracoes da org | Nenhum |
| Outros perfis | Nenhum |
| Billing | Nenhum |
| Team members | Nenhum |

### Implementacao Frontend

- Novo layout simplificado para CLIENT (sem sidebar completa)
- Dashboard com metricas do perfil
- Calendario read-only (ou com aprovacao)
- Biblioteca de midia read-only

### Endpoints Necessarios

```
POST /profiles/:id/invite       — Enviar convite para cliente
POST /profiles/:id/accept       — Cliente aceita convite
GET  /client/dashboard          — Dashboard do cliente
GET  /client/posts              — Posts do perfil do cliente
POST /client/posts/:id/approve  — Cliente aprova post
```

### Consideracoes de Seguranca

- CLIENT nunca deve ver `Organization.apiKey`, `lateApiKey`, ou tokens de integracao
- Filtro no middleware: se `ProfileRole === CLIENT`, forcar redirect para rotas `/client/*`
- Rate limiting mais agressivo para contas CLIENT
- Audit log de todas acoes do CLIENT

### Pre-requisitos

- [x] Modelo Profile e ProfileMember (Fase 0)
- [x] Backend Profile Context (Fase 1)
- [ ] Frontend Profile Selector (Fase 2)
- [ ] Profile role enforcement completo (Fase 3)

### Estimativa de Escopo

- Backend: ~15 arquivos novos/modificados
- Frontend: ~10 componentes novos
- Testes: ~20 testes de integracao

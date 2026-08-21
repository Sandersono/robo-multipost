# Triagem dos achados — 2026-08-21

Varredura completa de `.semgrep/` sobre o `main` (`8931e4f8`): **68 achados**
(agrupados por arquivo+regra; a linha "196 Code Findings" do semgrep conta cada
ocorrência individual).

| Regra | Achados | Triado | Veredito |
|---|---|---|---|
| `fetch-user-url-without-ssrf-dispatcher` | 34 | **sim** | **5 reais — corrigidos; 29 falso positivo** |
| `prisma-query-by-id-without-org-filter` | 17 | **sim** | **todos falso positivo** |
| `dangerously-set-inner-html-unsanitized` | 10 | **sim** | **13 sites corrigidos, 3 falso positivo** |
| `weak-random-secret-generation` | 5 | **sim** | **todos reais — corrigidos** |
| `jwt-sign-without-expiry` | 2 | **sim** | **1 corrigido, 1 é o B3 (pendente)** |
| `jwt-verify-without-algorithm-pin` | 1 | **sim** | **corrigido** |

---

## `prisma-query-by-id-without-org-filter` — 17 achados, 0 reais

Cada `id` foi seguido até a origem. Em nenhum caso ele chega cru do request.

| Motivo | Arquivos |
|---|---|
| Deriva de busca já escopada por organização | `credentials` (via `findByProvider(organizationId,…)`), `oauth` (via `findFirst({organizationId})`), `review-links` (id vem do token já validado) |
| Entidade global, sem `organizationId` no modelo | `users`, `subscriptions`, `notifications` (todos `User`), `announcements` |
| Vem de entidade resolvida pelo guard | `profiles.getZernioApiKey` (recebe `profile.id` de `@GetProfileFromRequest`) |
| Não alcançável por HTTP | `flows.getFlowById` (activity do Temporal), `integrations.getPlug` (job de fila), `agencies.approveOrDecline` (sem rota no backend) |
| Já recebe escopo do chamador | `repost.getRuleById(id, orgId, profileId)` |
| Protegido por `isSuperAdmin` | `announcements.deleteAnnouncement`, `organizations.getUserOrg` (impersonação) |
| Chamada interna após validação de posse | `posts.updateImages`, `media.getMediaById`, `autopost.getAutopost`, `knowledge.getById` |

**Conclusão:** a regra é heurística por natureza — ela não enxerga a camada acima,
e o próprio texto dela diz "confirme que a camada acima impõe o escopo". Com 17
achados e nenhum real, ela funciona como lembrete de revisão, não como portão.
Mantida no baseline (não bloqueia), e esta tabela existe para que a próxima
auditoria não refaça a investigação.

**Se um achado novo aparecer nesta regra**, a pergunta a responder é uma só:
*de onde vem o `id`?* Se for de `@Param`/`@Body` sem validação de posse, é real.

---

## JWT — 2 corrigidos, 1 decisão pendente

**Corrigido — B9, `verify()` sem `algorithms`.** Sem o pin, o `jsonwebtoken`
aceita qualquer algoritmo HMAC que valide com o mesmo segredo; um token forjado
em HS512 passava (demonstrado em `apps/backend/src/services/auth/jwt-hardening.spec.ts`).
Fixado em `['HS256']`, que é o que `signJWT` emite — nenhum token existente
invalidado.

**Corrigido — token de SSO do agent-media sem expiração.** Era um token de
handoff, usado uma vez ao abrir a URL, mas valia para sempre: vazado em log,
histórico ou `Referer`, daria acesso indefinido. Agora `expiresIn: '15m'`.

**PENDENTE — B3, JWT de sessão sem expiração.** `AuthService.signJWT` não define
`expiresIn`, o cookie dura 1 ano e não há denylist nem revogação. **Não é ajuste
mecânico:** adicionar expiração sem refresh token desloga todo mundo quando o
prazo vencer. A correção que a auditoria recomenda — `expiresIn` curto + refresh
+ denylist no Redis — é feature, com impacto de produto. Decisão do dono do
produto, não do revisor.

---

## `dangerously-set-inner-html-unsanitized` — 10 achados, 13 sites corrigidos

**A regra sub-detecta.** Ela pega a forma multilinha (`__html:` em linha
propria) mas deixa passar a forma inline de uma linha
(`dangerouslySetInnerHTML={{ __html: x }}`) — por isso TikTok e YouTube nao
aparecem nos 10 achados. Varredura direta encontrou **16 sites** no frontend.

| Situacao | Sites | Quais |
|---|---|---|
| Ja sanitizados antes | 2 | `p/[id]/page.tsx`, `notification.component.tsx` |
| Sanitiza fora da linha do `__html` | 1 | `agent.chat.tsx` — falso positivo |
| Sem sanitizacao | 13 | **corrigidos** |

**Por que e real, e nao self-XSS.** O conteudo do post e HTML de verdade — o
editor e TipTap — por isso os previews usam `dangerouslySetInnerHTML`. So que o
composer nao serve so para criar: ele **abre post ja salvo** (`useExistingData`
em `new-launch/editor.tsx`). Entao o HTML que a agencia escreveu renderiza no
navegador do cliente, e o que o cliente escreveu renderiza no da agencia. E XSS
armazenado atravessando usuarios — contido ao mesmo perfil (um cliente nao
injeta no perfil de outro), mas agencia <-> cliente dentro do perfil e
exatamente a fronteira que a camada de perfis existe para proteger.

**A correcao nao custa formatacao.** A allowlist de `sanitizePostContent`
(`p, br, strong, u, a, ul, li, h1-h3, span` + `data-mention-*`) casa exatamente
com as extensoes do TipTap registradas no editor: `Paragraph`, `Bold`,
`Underline`, `BulletList`, `ListItem`, `Link`, `Heading`, `Mention`. Nao ha
italico. E e o mesmo sanitizador que a pagina de review ja aplicava ao mesmo
`content` — os previews passam a concordar com o que o cliente ve, em vez de
divergir dele.

**`faq.component.tsx` e falso positivo:** o `description` vem de `t(...)`,
string de traducao do proprio repo, e as unicas tags nas traducoes sao `<a>` e
`<p>`. Sanitizado mesmo assim — custo zero e mantem a regra limpa.

**Guard:** `apps/backend/src/services/security/xss-innerhtml.guard.spec.ts`
varre todo `.tsx` do frontend e exige sanitizador em cada `__html`. Mora no
backend porque `apps/frontend` nao tem projeto jest — mesmo motivo do
`jwt-hardening.spec.ts`; o spec apenas le arquivos.

---

## `fetch-user-url-without-ssrf-dispatcher` — 34 achados, 5 reais

34 arquivos, 77 ocorrências. **A regra casa pelo nome da variável**
(`url|uri|endpoint|webhook|href|link|picture|image`), não por a URL ser de fato
controlada pelo usuário — daí o volume. O critério de triagem foi um só: **o
servidor busca uma URL que o usuário escolhe?**

### Reais — corrigidos

| Onde | Origem da URL |
|---|---|
| `no.auth.integrations.controller.ts:307` | webhook do tenant, gravado em `/enterprise/url` |
| `autopost.service.ts:189` | URL configurada no autopost, carregada e parseada com JSDOM |
| `extract.content.service.ts:18` | URL do usuário (serviço registrado nos módulos, hoje sem chamador) |
| `mastodon.custom.provider.ts:26` | instância Mastodon informada ao conectar o canal |
| `ai-image.service.ts:253` | imagem de referência — o próprio comentário do código diz que a URL é do usuário |

O primeiro é o mais sério: além do SSRF, esse POST leva **um JWT com a `apiKey`
da organização** para a URL escolhida pelo tenant. Como a chave é a dele
próprio, não há vazamento entre tenants — mas continua sendo o servidor batendo
em endereço arbitrário com credencial no corpo.

Todos passaram a usar `{ dispatcher: ssrfSafeDispatcher }`, o mesmo padrão já
aplicado em `webhooks.controller.ts`, `post.activity.ts`,
`approval-notifier.service.ts` e `storage.helpers.ts`.

### Falso positivo — 29

- **Host fixo (literal ou constante de módulo):** os providers sociais
  (LinkedIn, Instagram, Facebook, TikTok, Slack, Reddit, GMB, Zernio, Skool,
  Whop, MeWe), os serviços de IA (`OPENAI_*`, `OPENROUTER_*`, `TAVILY_*`),
  short-linking (`DUB_API_ENDPOINT`, `KUTT_API_ENDPOINT`,
  `LINK_DRIP_API_ENDPOINT`, `api.short.io`), `reelfarm` (`BASE_URL`) e
  `credential.service.ts` (`graph.facebook.com` literal).
- **Código de navegador, não de servidor:** `custom.fetch.func.ts` (lê
  `document.cookie`) e `uppy.upload.ts` (URL relativa `/media/...`). A regra
  inclui `libraries/**` inteiro e não distingue.
- **Configuração de ambiente** — mesma fronteira de confiança do `.env`, não do
  usuário: `oauth.provider.ts` (`tokenUrl`/`userInfoUrl` de `getConfig()`) e
  `oauth-middleware.ts` (`introspectionEndpoint`).
- **URL devolvida pela API do provider já autenticado:** `whop.provider.ts:250`
  (`upload_url`), `skool.provider.ts:234` (`write_url`), `mewe.provider.ts:181`
  (`nextUrl` de paginação).
- **Download da própria mídia do app:** `mastodon.provider.ts:118` e
  `bluesky.provider.ts:77` recebem `media.path`/`videoPath`, gravados pelo
  app no upload. *Ressalva:* se algum dia existir "adicionar mídia por URL
  externa", esses dois viram reais e precisam do dispatcher.

### Nota operacional — a overlay do Swarm é bloqueada

`isBlockedIp` rejeita `10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`,
`172.16.0.0/12`, `192.168.0.0/16`, `::1` e `fc00::/7`. A rede overlay do Docker
Swarm fica em `10.0.0.0/8`.

Consequência para a Fase 3 do plano multiempresa: o webhook de "post aguardando
aprovação" (`approval-notifier.service.ts:96`) **já** usa o dispatcher, então
apontá-lo para o endereço interno do n8n na overlay `network_public` vai falhar
com `Blocked IP`. O destino precisa ser um hostname público (via Traefik) — ou
o dispatcher precisa de uma allowlist explícita para esse salto interno.

---

## Estado da triagem

As quatro categorias foram triadas. Segue pendente apenas o **B3** (JWT de
sessão sem expiração) — que não é triagem, e sim decisão de produto: ver a
seção de JWT acima.

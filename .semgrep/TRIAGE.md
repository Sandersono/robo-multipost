# Triagem dos achados — 2026-08-21

Varredura completa de `.semgrep/` sobre o `main` (`8931e4f8`): **68 achados**
(agrupados por arquivo+regra; a linha "196 Code Findings" do semgrep conta cada
ocorrência individual).

| Regra | Achados | Triado | Veredito |
|---|---|---|---|
| `fetch-user-url-without-ssrf-dispatcher` | 34 | não | pendente |
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

## Ainda não triados

- **34 de SSRF** — a regra sinaliza `fetch()` sem `ssrfSafeDispatcher`. Boa parte
  deve ser chamada a host fixo de provider (não URL de usuário), mas precisa ser
  verificada caso a caso.

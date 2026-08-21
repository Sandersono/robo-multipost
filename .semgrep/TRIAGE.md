# Triagem dos achados — 2026-08-21

Varredura completa de `.semgrep/` sobre o `main` (`8931e4f8`): **68 achados**
(agrupados por arquivo+regra; a linha "196 Code Findings" do semgrep conta cada
ocorrência individual).

| Regra | Achados | Triado | Veredito |
|---|---|---|---|
| `fetch-user-url-without-ssrf-dispatcher` | 34 | não | pendente |
| `prisma-query-by-id-without-org-filter` | 17 | **sim** | **todos falso positivo** |
| `dangerously-set-inner-html-unsanitized` | 10 | não | pendente |
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

## Ainda não triados

- **34 de SSRF** — a regra sinaliza `fetch()` sem `ssrfSafeDispatcher`. Boa parte
  deve ser chamada a host fixo de provider (não URL de usuário), mas precisa ser
  verificada caso a caso.
- **10 de `innerHTML`** — esta regra só passou a funcionar em 2026-08-19 (antes
  não compilava), então nunca foi revisada.
- **5 de PRNG fraco** — o achado B2 foi declarado corrigido no CHANGELOG; vale
  conferir se são resíduos ou pontos que escaparam.

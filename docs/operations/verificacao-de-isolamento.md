# Verificação de isolamento entre perfis

O isolamento entre clientes é o requisito que originou este fork: numa agência,
dois clientes podem ser concorrentes, e nenhum pode ver o calendário, os canais
ou as métricas do outro.

O código tem guards que impedem a regressão dessa propriedade
(`profile-isolation.guard.spec.ts` e `profile-write-scope.guard.spec.ts`), mas
guard roda contra *mock*. Este documento é o teste contra dado real. Rode-o
**antes de colocar o primeiro cliente** e depois de cada release que toque
perfis, canais ou permissões.

## Não precisa do Facebook

Conectar um canal não exige app de desenvolvedor da Meta. Oito providers pedem
apenas credencial da própria conta, sem OAuth registrado:

`bluesky` · `dev.to` · `hashnode` · `lemmy` · `listmonk` · `medium` · `nostr` · `wordpress`

O caminho mais rápido é o **Bluesky**: conta gratuita, e a conexão pede só o
handle e uma *app password* (gerada em Settings → App Passwords, no próprio
Bluesky). O provider não lê nenhuma variável de ambiente.

## Preparação

Você precisa de **duas contas** no provider escolhido — elas representam dois
clientes diferentes.

1. **Dois perfis.** Em Configurações → Perfis, crie `Cliente A` e `Cliente B`.
2. **Um canal em cada.** Selecione `Cliente A` no seletor do topo, conecte a
   primeira conta. Troque para `Cliente B`, conecte a segunda.
   *O perfil ativo no momento da conexão é o que grava o `profileId` no canal —
   conectar com o perfil errado põe o canal no cliente errado.*
3. **Um usuário cliente.** Em Configurações → Equipe, convide um e-mail
   (que você controle) para o perfil `Cliente A`, com função **Visualizador**
   ou **Editor**. Se o e-mail ainda não estiver configurado no servidor,
   desmarque "enviar convite por e-mail" e use o link copiado — ele vale 1 hora
   e só serve para o e-mail que você digitou.
4. Abra o link numa janela anônima e crie a conta do cliente.

Ao final: 2 perfis, 2 canais, e um usuário que é membro **apenas** de `Cliente A`.

## Como o perfil ativo viaja

O backend resolve o perfil pelo cookie/header **`showprofile`**, e a regra
difere por papel de organização:

| Papel na org | Perfis que pode ativar |
|---|---|
| `ADMIN` / `SUPERADMIN` | **todos** os da organização (acesso implícito) |
| `USER` | apenas aqueles de que é membro |

Para um `USER`, pedir um perfil de que não é membro **não dá erro** — o valor é
ignorado e ele cai no próprio perfil. Isso é o que o teste principal verifica.

## Os testes

Faça login como o **usuário cliente** (membro só de `Cliente A`) e capture o
cookie `auth`. Guarde também o id do perfil `Cliente B` (visível no seletor da
conta de admin, ou via banco).

```bash
AUTH='<valor do cookie auth do usuario cliente>'
B='<id do perfil Cliente B>'
BASE=https://app.postcast.com.br/api
```

### 1. A listagem de perfis não revela o vizinho

```bash
curl -s -b "auth=$AUTH" "$BASE/profiles" | jq -r '.[].name'
```

**Passa se:** aparece só `Cliente A`. Se `Cliente B` aparecer, o isolamento
falhou já na primeira camada.

### 2. Forjar o perfil não muda nada — o teste principal

```bash
curl -s -b "auth=$AUTH" -H "showprofile: $B" "$BASE/integrations/list"   | jq -r '.integrations[].name'
```

**Passa se:** vêm os canais de `Cliente A`, **não** os de `Cliente B`. O header
forjado deve ser ignorado, não obedecido nem rejeitado com erro.

Repita trocando `integrations/list` por: `posts`, `media`, `webhooks`,
`autopost`, `sets`, `signatures`. Nenhum pode devolver conteúdo de `B`.

### 3. Escrita cruzada é recusada

Pegue o id de um recurso de `Cliente B` (pelo banco) e tente sobrescrevê-lo como
o usuário de `A`:

```bash
curl -s -o /dev/null -w '%{http_code}
' -b "auth=$AUTH"   -X PUT "$BASE/webhooks" -H 'Content-Type: application/json'   -d '{"id":"<id de um webhook do Cliente B>","name":"x","url":"https://exemplo.com","integrations":[]}'
```

**Passa se:** o webhook de `B` continua intacto. Confira no banco:

```sql
select id, name, url, "profileId" from "Webhooks" where id = '<id>';
```

Se `name`, `url` ou `profileId` mudaram, houve escrita cruzando perfis.

### 4. Usuário sem perfil é barrado

Convide um segundo e-mail **sem** vincular a perfil nenhum (ou remova a
associação depois). Ao logar, ele deve receber `403 NO_PROFILE_ASSIGNED` nas
rotas de dados e cair na tela de "aguardando atribuição de perfil" — não uma
tela vazia com acesso implícito.

### 5. Conferência no banco

```sql
select p.name as perfil, count(i.id) as canais
from "Profile" p
left join "Integration" i on i."profileId" = p.id and i."deletedAt" is null
where p."deletedAt" is null
group by p.name order by p.name;
```

**Passa se:** cada perfil tem os próprios canais e **nenhum canal tem
`profileId` nulo**:

```sql
select count(*) from "Integration" where "profileId" is null and "deletedAt" is null;
```

Tem que devolver `0`. Canal sem perfil aparecia para todos os perfis — esse era
o vazamento original, e a semeadura vincula tudo ao perfil Default.

## Nunca dê `ADMIN` de organização a um cliente

Um cliente com papel de organização `ADMIN` ou `SUPERADMIN` **desliga o
isolamento inteiro**: o `ProfileAccessGuard` devolve `true` incondicionalmente
para admins, e o middleware lhe dá acesso implícito a todos os perfis. Ele
passaria em todos os testes acima — vendo tudo.

Para cliente, use papel de organização `USER` e função de perfil
`VIEWER` (lê e aprova) ou `EDITOR` (também cria e agenda).

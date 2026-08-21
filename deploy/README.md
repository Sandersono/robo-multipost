# Deploy — Docker Swarm

Stack de producao do Robo MultiPost na VPS `manager01` (Debian 12, Hostinger KVM 2).

| Arquivo | Papel |
|---|---|
| `swarm/multipost-stack.yml` | O stack: banco, cache, Temporal e app |
| `swarm/dynamicconfig/production-sql.yaml` | Dynamic config do Temporal (visibility em SQL) |
| `swarm/.env.example` | Modelo dos segredos — o real fica em `/opt/multipost/.env`, fora do git |

## O que a maquina ja precisa ter

O stack **reusa** o que ja roda na VPS em vez de duplicar:

- **Docker Swarm** ativo, com a overlay externa `network_public`.
- **Traefik v2.11** com o certResolver `letsencryptresolver` — e ele quem termina o TLS. O stack nao sobe Nginx.
- DNS de `app.postcast.com.br` apontando para a VPS.

Banco e cache ficam numa overlay interna (`multipost_internal`), fora da `network_public`.

## Implantar

```bash
# 1. Os arquivos vao para /opt/multipost na VPS
#    (multipost-stack.yml na raiz, production-sql.yaml em dynamicconfig/)

# 2. Carregue os segredos no ambiente e implante
set -a && . /opt/multipost/.env && set +a
docker stack deploy -c /opt/multipost/multipost-stack.yml multipost --with-registry-auth
```

As migracoes do Prisma rodam sozinhas: o `CMD` da imagem executa `prisma-db-push` no boot, antes de subir os apps.

## Por que o stack difere do `docker-compose.yaml` da raiz

O compose da raiz e para desenvolvimento. As diferencas aqui sao deliberadas e economizam memoria numa VPS de 8 GB:

- **Sem Elasticsearch** — o Temporal usa visibility em SQL (~700 MB a menos). Isso impoe um teto **fixo de 3 search attributes do tipo Text**, e por isso o stack define `SKIP_ADD_CUSTOM_SEARCH_ATTRIBUTES=true`: o `auto-setup` criava dois atributos de demonstracao que ninguem usa, sobrava uma vaga e o backend precisa de duas (`organizationId` e `postId`), estourando o boot.
- **Sem Postgres dedicado ao Temporal** — `temporal` e `temporal_visibility` vivem no mesmo PG17 do app.
- **Sem Nginx** — quem termina TLS e o Traefik da maquina.
- **Sem spotlight/admin-tools** — ferramentas de desenvolvimento.

A imagem e `pgvector/pgvector:pg17` porque a base de conhecimento (RAG) exige a extensao `pgvector`.

## Armadilhas conhecidas

**`ENCRYPTION_KEY` e definitiva.** Depois do primeiro canal conectado, trocar a chave torna ilegivel todo token e credencial gravados. Nao ha recuperacao.

**A overlay do Swarm e bloqueada para webhooks.** O `ssrfSafeDispatcher` rejeita `10.0.0.0/8` (entre outras faixas privadas), e a overlay do Swarm fica nessa faixa. Um webhook de saida apontado para o endereco interno de outro servico na overlay — o n8n, por exemplo — falha com `Blocked IP`. Use hostname publico via Traefik.

**O limite de memoria do app e teto, nao reserva.** Os tres processos Node em repouso somam ~100 MB de RSS; o resto do que o `docker stats` mostra e page cache da imagem (5,8 GB de filesystem), que o kernel recupera sozinho. Com 1536M o container vivia a 98% do teto e forcava reclaim continuo — dai os 2560M.

## Atualizar a imagem

O pin e **fixo de proposito** — nunca `:latest` nem `:prerelease`, que se movem sob os pes.

A imagem sai do `.github/workflows/build-containers.yml`, disparado por tag `v*`. Ele publica em `ghcr.io/${GITHUB_REPOSITORY,,}` (neste fork, `ghcr.io/sandersono/robo-multipost`) e usa a tag **sem o `v` inicial** — `CONTAINERVER="${GITHUB_REF_NAME#v}"`. Ou seja, a tag `v0.5.6-rc.11` produz a imagem `:0.5.6-rc.11`.

Antes de trocar o pin, confira o que esta no ar:

```bash
docker service inspect multipost_multipost-app --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}'
```

Depois edite o `image:` do stack e reimplante. Uma release estavel (sem hifen na versao) tambem recebe `:latest`; uma pre-release recebe `:prerelease`.

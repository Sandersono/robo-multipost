# Operar olhando 2–3 vezes por dia sem perder venda

Objetivo: a plataforma avisa você quando precisa de você, e responde o lead
sozinha quando você não está olhando.

O diagnóstico que organiza tudo abaixo: **quase toda a máquina já existe.** O
que falta não é tela — é a plataforma **alcançar você** entre uma olhada e
outra. Hoje toda informação espera que alguém entre e veja.

---

## P0 — Responder o lead em segundos, sem código

Isto é o que converte, e já está pronto para usar: um Flow por canal do
Instagram.

```
TRIGGER (comentário, palavras: preço, valor, quero, info)
 ↓
REPLY_COMMENT resposta pública (dá prova social para quem passa)
 ↓
SEND_DM mensagem + botão "Falar no WhatsApp" → wa.me/55...?text=...
```

Funciona 24 horas, não depende de você estar na plataforma, e o `?text=`
pré-preenchido já diz que o contato veio do Instagram.

**Por que é P0:** o lead que comenta "quanto custa" e não é respondido em
minutos vai no concorrente. Nenhum alerta para você resolve isso tão bem
quanto a resposta automática.

Receita completa em [`docs/automacoes-disponiveis.md`](../automacoes-disponiveis.md).

---

## P1 — Resumo empurrado, 2 ou 3 vezes por dia

**O que construir:** um workflow agendado que monta um resumo por perfil e
dispara pelo webhook de saída → n8n → seu WhatsApp.

Conteúdo do resumo:

- o que **falhou** (post em erro, automação quebrada)
- o que **espera aprovação** do cliente, e há quanto tempo
- o que **publica hoje** e o que ficou sem nada agendado
- canais que precisam **reconectar**
- leads que **escaparam dos flows** (comentários sem correspondência)

**Por que é barato:** `StatusService.getProblems(org, profileId)` já agrega
canais com problema, posts com erro e execuções de flow que falharam — e já é
escopado por perfil. O webhook de saída já existe, com proteção de SSRF e
escopo por perfil. Falta o agendamento e o evento.

**Esforço:** um workflow de loop com `continueAsNew` (o repost e o
`refresh-tokens-cron` são os dois modelos canônicos no repo), um evento novo de
webhook, e a configuração de horário por perfil.

---

## P2 — Alerta imediato do que não pode esperar o próximo resumo

Dois eventos fazem você perder dias de publicação em silêncio:

| Evento | Por que é urgente |
|---|---|
| **Canal desconectado** | para de publicar sem erro visível; cada hora é post perdido |
| **Post em ERRO** | o conteúdo não saiu, e muitas vezes era data marcada |

**O que construir:** emitir webhook nos mesmos pontos onde o `StatusEvent` já é
gravado. São pontos únicos de serviço (desconexão de canal, mudança de estado
do post para ERRO, automação para FALHOU), então o alerta sai de um lugar só e
não espalha código.

**Esforço:** pequeno — o ponto de gravação já existe e já é fail-soft.

---

## P3 — Resumo para o cliente, para ele não te cobrar

O mesmo motor do P1, apontado para o perfil do cliente: "publicamos X esta
semana, Y está esperando sua aprovação". Reduz a mensagem de cliente
perguntando se está tudo andando — que é trabalho seu sem ser venda.

Depende do P1 estar de pé.

---

## P4 — Já existe, só falta usar

| Recurso | Para quê |
|---|---|
| **Autopost** | feed/URL → posts agendados, alimenta o calendário sem você |
| **Plugs** (X, Threads, Bluesky, LinkedIn) | republica o post que performou, ao atingir N curtidas |
| **Aba de automações → logs** | comentários que não casaram com nenhum flow, com botão para ligá-los a um flow — é lista de lead que escapou |
| **Envio para aprovação** | botão no calendário, selo de estado, webhook para o cliente |
| **Status → Problemas / Saúde da infra** | o painel que o P1 vai empurrar para você |

---

## A dependência que trava P1–P3

O caminho de entrega. O webhook de saída usa `ssrfSafeDispatcher`, que rejeita
faixa privada — **incluindo `10.0.0.0/8`, que é a overlay do Docker Swarm**.
Apontar o webhook para o endereço interno do n8n falha com `Blocked IP`.

O destino precisa ser hostname público via Traefik. Sem isso resolvido, nada de
P1 a P3 chega no seu WhatsApp.

E-mail segue como alternativa: sem provedor configurado, os envios são
descartados em silêncio.

---

## Ordem que eu recomendo

1. **P0 agora** — é configuração, não desenvolvimento, e é o que converte.
2. **Resolver o caminho n8n** (hostname público) — destrava todo o resto.
3. **P2 antes do P1** — menor e evita o prejuízo mais caro (canal mudo).
4. **P1**, depois **P3**.

P4 pode ser ligado em paralelo a qualquer momento.

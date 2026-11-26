# Automações disponíveis

Inventário do que o Robô MultiPost automatiza hoje, lido do código (não da
documentação do upstream). Dividido entre o que você configura e o que roda
sozinho.

---

## 1. Motor de Flows do Instagram — o que mais se parece com um "agente"

É **por canal** (`Flow.integrationId`), então cada conta do Instagram tem os
seus próprios flows. É aqui que se faz "comentou → recebe o WhatsApp no
direct", não na Persona de IA.

### Gatilhos

| Gatilho | Quando dispara |
|---|---|
| `comment_on_post` | alguém comenta num post (opcionalmente só em posts escolhidos, via `triggerPostIds`) |
| `story_reply` | alguém responde um story ou reage a ele |

O gatilho aceita **palavras-chave**: sem correspondência, o flow nem executa.

### Nós disponíveis (`FlowNodeType`)

| Nó | O que faz |
|---|---|
| `TRIGGER` | entrada; carrega palavras-chave e a trava de seguidor |
| `CONDITION` | ramifica em `match` / `no_match` pelo texto recebido |
| `REPLY_COMMENT` | responde publicamente no comentário; aceita uma **lista** de mensagens e sorteia uma, para não repetir sempre igual |
| `SEND_DM` | manda mensagem privada, com **botão opcional** (`buttonText` + `buttonUrl`) |
| `DELAY` | espera segundos, minutos ou horas antes de seguir |

### Trava de seguidor (follow-gate)

Com `requireFollow`, quem não segue recebe uma mensagem pedindo para seguir em
vez da entrega. Para **comentários** o fluxo é de duas etapas, porque o Meta não
informa de forma confiável se a pessoa segue antes de ela abrir a janela de
mensagem: responde o comentário publicamente → manda uma DM de abertura com
botão → ao clicar, a execução é retomada e a entrega final sai.

### Variáveis no texto

`{commenter_name}` · `{commenter_id}` · `{comment_text}` · `{media_id}`

### Limites do Meta que o motor já contorna

- **Uma única resposta privada por comentário.** Se o flow tiver vários
 `SEND_DM`, as mensagens são **juntadas numa só** antes de enviar.
- **Um único botão.** Se mais de um `SEND_DM` definir botão, vale o último.

---

## 2. Receita: direcionar o contato para o WhatsApp do atendimento

Monte um flow no canal do Instagram do cliente:

```
TRIGGER (comment_on_post, palavras-chave: preço, valor, quero, info)
 ↓
REPLY_COMMENT "{commenter_name}, te chamei no direct! 💙"
 ↓
SEND_DM mensagem + botão
 buttonText: "Falar no WhatsApp"
 buttonUrl: https://wa.me/55DDDNUMERO?text=Oi!%20Vim%20do%20Instagram
```

Pontos que decidem se funciona bem:

- O `buttonUrl` aceita qualquer URL, então o `wa.me` com `?text=` pré-preenchido
 entra direto — é assim que você sabe que o contato veio do Instagram.
- Use **um** `SEND_DM` com botão. Um segundo botão sobrescreve o primeiro.
- `requireFollow` ligado transforma o atendimento em captação de seguidor, mas
 acrescenta um passo (a pessoa precisa clicar no botão da DM de abertura).
- A resposta pública no comentário é o que faz outras pessoas verem que há
 atendimento — vale manter, mesmo com a entrega no direct.

**A Persona de IA não serve para isso.** Ela é por perfil e orienta *geração de
conteúdo* (tom, CTAs preferidos, restrições). O `preferredCtas` influencia o
texto que a IA escreve, não dispara mensagem para ninguém.

---

## 3. Automações que você configura

### Autopost
Lê uma URL ou feed e gera posts automaticamente, com agendamento. Opcional:
gerar o texto com IA e anexar imagem.

### Regras de repost
Republica posts próprios em destinos definidos, em intervalo configurado.

### Plugs (por canal, disparados por engajamento)

Disponíveis em **X, Threads, Bluesky e LinkedIn Page**:

| Plug | Comportamento |
|---|---|
| `Auto Repost Posts` | quando um post atinge N curtidas, republica para aumentar alcance (olha posts de até 1 semana) |
| `Auto plug post` | quando um post atinge N curtidas, publica um post emendado nele, para os seguidores receberem notificação |

Ambos rodam a cada **6 horas**, no máximo **3 vezes** por post.

### Webhooks de saída (por perfil)
Evento `post.aguardando_aprovacao` quando a equipe envia um post para
aprovação. O destino típico é um fluxo n8n que manda WhatsApp. Escopado por
perfil: o webhook de um cliente nunca recebe post de outro.

---

## 4. Automações que já rodam sozinhas (sem configurar)

| Automação | O que faz |
|---|---|
| `refresh-tokens-cron` | renova diariamente, em lote, todo canal cujo token expira em ≤1 dia — cobre todos os providers |
| `refresh.token` por canal | renovação antecipada para Threads e Instagram-standalone |
| `missing.post` | detecta post que falhou e tenta de novo |
| `digest.email` / `streak` | resumos por e-mail e sequência de publicação |
| `enrich-unmatched-comment` | enriquece comentários que não casaram com nenhum flow, com thumbnail e legenda do post |

Os e-mails dependem de provedor configurado — sem isso o envio é descartado em
silêncio.

---

## 5. O que não existe

- Agente por **canal**: a Persona de IA é `profileId @unique`, uma por perfil.
 Para vozes diferentes, use um perfil por conta.
- Nós de flow além dos cinco acima — não há "adicionar etiqueta", "mover no
 CRM" ou "chamar webhook" dentro do flow. Integração externa sai pelos
 webhooks de saída ou pelo n8n.
- Gatilho por DM recebida fora de story reply.

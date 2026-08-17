#!/bin/bash
# Hook: bloqueia gh pr <mutating> sem --repo Sandersono/robo-multipost
#
# Motivo: a cadeia de forks tem TRES niveis --
#   gitroomhq/postiz-app  ->  maiconramos/robo-multipost  ->  Sandersono/robo-multipost
#
# Sem --repo explicito, o gh CLI resolve o PR contra o upstream, e um PR
# interno acaba exposto num repositorio que nao e nosso (incidente real:
# PR #1509 em gitroomhq/postiz-app, ver feedback_gh_pr_repo.md).
#
# ATENCAO ao ajustar: o alvo tem que ser o repo que VOCE controla (origin).
# Este guard ja apontou para maiconramos/robo-multipost -- correto no repo de
# origem, mas neste fork isso mandaria todo PR para o repo do Maicon, que e
# exatamente o tipo de vazamento que o guard existe para impedir.

input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')

# So bloqueia comandos mutating de PR (create/edit/merge/close/ready/review/comment/reopen).
# Comandos read-only (view, list, diff, checks, status) continuam livres.
if echo "$cmd" | grep -qE '\bgh[[:space:]]+pr[[:space:]]+(create|edit|merge|close|ready|review|comment|reopen)\b'; then
  if ! echo "$cmd" | grep -qE -- '--repo[[:space:]]+Sandersono/robo-multipost\b'; then
    echo 'BLOQUEADO: gh pr <create|edit|merge|close|ready|review|comment|reopen> SEM --repo Sandersono/robo-multipost.' >&2
    echo 'Este repo e fork de maiconramos/robo-multipost (que por sua vez e fork de gitroomhq/postiz-app);' >&2
    echo 'sem --repo, o comando vai contra um upstream que nao e seu.' >&2
    echo 'Reescreva: gh pr <subcomando> --repo Sandersono/robo-multipost --base main --head <branch> ...' >&2
    exit 2
  fi
fi

exit 0

// Formata o erro devolvido pela Graph API da Meta numa mensagem legivel para o
// historico de execucoes das automacoes. Antes so o `error.message` era usado e
// o code/subcode se perdia — e e o subcode que diz o que o dono da conta precisa
// fazer (ex.: 2534041 = acesso a mensagens desligado no app do Instagram).

// "O dono da conta desativou o acesso as mensagens diretas do Instagram."
export const IG_MESSAGING_DISABLED_SUBCODE = 2534041;

export const IG_MESSAGING_DISABLED_HINT =
  'Ative "Permitir acesso a mensagens" no app do Instagram (Configurações > ' +
  'Mensagens e respostas de stories > Ferramentas de mensagens conectadas) ' +
  'e tente de novo.';

export function formatGraphApiError(
  prefix: string,
  status: number,
  body: any
): string {
  const err = body?.error;
  if (!err || typeof err !== 'object') {
    return `${prefix} (${status}): ${JSON.stringify(body ?? null)}`;
  }

  const ids = [
    err.code != null ? `code=${err.code}` : null,
    err.error_subcode != null ? `subcode=${err.error_subcode}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  let out = `${prefix} (${status}): ${err.message || JSON.stringify(err)}`;
  if (ids) out += ` [${ids}]`;
  if (Number(err.error_subcode) === IG_MESSAGING_DISABLED_SUBCODE) {
    out += ` ${IG_MESSAGING_DISABLED_HINT}`;
  }
  return out;
}

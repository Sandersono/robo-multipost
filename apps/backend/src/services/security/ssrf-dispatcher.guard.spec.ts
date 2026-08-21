import { readFileSync } from 'fs';
import { join } from 'path';

// Guarda de arquitetura: os fetch() cujo alvo o USUARIO escolhe precisam do
// ssrfSafeDispatcher, que fixa o IP resolvido no connect e rejeita faixa
// privada/reservada (isBlockedIp).
//
// A regra do Semgrep casa pelo nome da variavel (url|uri|endpoint|webhook|...),
// entao ela aponta 34 arquivos, quase todos host fixo de provider. Este guard
// cobre so os 5 sites triados como reais em .semgrep/TRIAGE.md — se algum
// perder o dispatcher, o teste quebra.
//
// Nao tenta resolver o caso geral de proposito: um guard que exigisse
// dispatcher em todo fetch() daria falso positivo em cada chamada a API de
// provider e seria desligado na primeira semana.
const ROOT = join(__dirname, '../../../../..');

const SITES = [
  {
    file: 'apps/backend/src/api/routes/no.auth.integrations.controller.ts',
    ancora: 'fetch(webhookUrl',
    origem: 'webhook do tenant, gravado em /enterprise/url',
  },
  {
    file: 'libraries/nestjs-libraries/src/database/prisma/autopost/autopost.service.ts',
    ancora: 'await fetch(url, {',
    origem: 'URL configurada no autopost',
  },
  {
    file: 'libraries/nestjs-libraries/src/openai/extract.content.service.ts',
    ancora: 'await fetch(url, {',
    origem: 'URL fornecida pelo usuario',
  },
  {
    file: 'libraries/nestjs-libraries/src/integrations/social/mastodon.custom.provider.ts',
    ancora: "fetch(url + '/api/v1/apps'",
    origem: 'instancia Mastodon informada pelo usuario',
  },
  {
    file: 'libraries/nestjs-libraries/src/ai/ai-image.service.ts',
    ancora: 'fetch(referenceImageUrl',
    origem: 'imagem de referencia fornecida pelo usuario',
  },
];

describe('SSRF — fetch de URL escolhida pelo usuario usa ssrfSafeDispatcher', () => {
  it.each(SITES.map((s) => [s.file, s] as const))('%s', (_nome, site) => {
    const source = readFileSync(join(ROOT, site.file), 'utf8');

    // O import precisa existir, senao o identificador abaixo nem compila.
    expect(source).toContain('ssrf.safe.dispatcher');

    const lines = source.split(/\r?\n/);
    const idx = lines.findIndex((l) => l.includes(site.ancora));
    expect(idx).toBeGreaterThanOrEqual(0);

    // O dispatcher tem que estar dentro do objeto de opcoes desse fetch.
    const janela = lines.slice(idx, idx + 12).join('\n');
    expect(janela).toContain('dispatcher: ssrfSafeDispatcher');
  });
});

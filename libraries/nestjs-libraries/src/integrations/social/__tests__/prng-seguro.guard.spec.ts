import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Guarda de arquitetura: valores de seguranca do fluxo OAuth nunca podem sair
// de `makeId`, que usa Math.random().
//
// `state` protege contra CSRF no callback; `codeVerifier` e o PKCE, cuja
// premissa e o atacante nao conseguir prever o valor. O PRNG do V8 tem estado
// recuperavel a partir de poucas saidas, e os providers geram state e verifier
// na mesma chamada — exatamente o cenario que torna a previsao viavel.
//
// `makeId` continua legitimo no mesmo arquivo para valores nao-secretos
// (placeholder de postId/messageId quando a API do provider nao devolve um).
const DIR = join(__dirname, '..');
const SECURITY_VALUE =
  /\b(state|codeVerifier|nonce)\s*[:=,]\s*makeId\(|append\(\s*['"]state['"]\s*,\s*makeId\(/;

const providers = readdirSync(DIR).filter(
  (f) => f.endsWith('.ts') && !f.endsWith('.spec.ts')
);

describe('Providers sociais — PRNG seguro em valores de OAuth', () => {
  it('encontra os providers para varrer (a varredura nao pode virar no-op)', () => {
    expect(providers.length).toBeGreaterThan(20);
  });

  it.each(providers)('%s nao gera state/codeVerifier/nonce com makeId', (file) => {
    const source = readFileSync(join(DIR, file), 'utf8');

    expect(source).not.toMatch(SECURITY_VALUE);
  });
});

// O `state` nao e so anti-CSRF aqui: ele e a chave do Redis que amarra o fluxo
// de OAuth a uma organizacao (`organization:${state}` -> org.id), lida de volta
// num callback SEM autenticacao (no.auth.integrations.controller.ts). Um acerto
// liga o canal na org errada — o exato tipo de mistura que a camada de perfis
// existe para impedir.
//
// Com 6 chars base62 (~36 bits) isso nao era explorável na pratica: 62^6 e
// grande demais para forca bruta por HTTP dentro do TTL de 1h. E margem, nao
// buraco — mas subir para 32 chars (~190 bits) nao custa nada, e e o que kick,
// vk e whop ja faziam.
const MIN_STATE_LEN = 32;
const STATE_LEN =
  /\bstate\s*[:=]\s*makeSecureId\((\d+)\)|['"]state['"]\s*,\s*makeSecureId\((\d+)\)/g;

describe('Providers sociais — entropia do state de OAuth', () => {
  it.each(providers)('%s gera state com pelo menos 32 chars', (file) => {
    const source = readFileSync(join(DIR, file), 'utf8');

    const curtos = [...source.matchAll(STATE_LEN)]
      .map((m) => Number(m[1] ?? m[2]))
      .filter((n) => n < MIN_STATE_LEN);

    expect(curtos).toEqual([]);
  });
});

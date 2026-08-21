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

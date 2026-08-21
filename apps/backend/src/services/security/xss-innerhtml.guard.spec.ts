import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

// Guarda de arquitetura: todo `dangerouslySetInnerHTML` do frontend precisa
// passar por um sanitizador.
//
// O conteudo do post e HTML de verdade — o editor e TipTap — por isso os
// previews usam `dangerouslySetInnerHTML` em vez de texto puro. So que o
// composer tambem abre post ja salvo (`useExistingData` em
// new-launch/editor.tsx): o HTML que a agencia escreveu renderiza no
// navegador do cliente, e o que o cliente escreveu renderiza no da agencia.
// Sem sanitizar, isso e XSS armazenado atravessando usuarios do mesmo perfil.
//
// Sanitizar nao custa formatacao: a allowlist de `sanitizePostContent`
// (p, br, strong, u, a, ul, li, h1-h3, span + data-mention-*) casa exatamente
// com as extensoes do TipTap registradas no editor. Nao ha italico.
//
// Este guard mora no backend porque `apps/frontend` nao tem projeto jest
// (jest.config.ts da raiz) — mesmo motivo de `auth/jwt-hardening.spec.ts`.
// Ele apenas le arquivos, nao executa codigo de frontend.
const FRONTEND_SRC = join(__dirname, '../../../..', 'frontend/src');

const SANITIZERS =
  /sanitizePostContent\(|sanitizeChatContent\(|DOMPurify\.sanitize\(/;

// Excecoes: sanitizam fora da linha do `__html`.
const ALLOWLIST: Record<string, string> = {
  'components/agents/agent.chat.tsx':
    'sanitizeChatContent roda dentro do useMemo que produz o valor',
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory()
      ? walk(full)
      : full.endsWith('.tsx')
      ? [full]
      : [];
  });

const files = walk(FRONTEND_SRC)
  .filter((f) => readFileSync(f, 'utf8').includes('dangerouslySetInnerHTML'))
  .map((f) => relative(FRONTEND_SRC, f).split(sep).join('/'));

describe('Frontend — dangerouslySetInnerHTML sempre sanitizado', () => {
  it('encontra os arquivos para varrer (a varredura nao pode virar no-op)', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)('%s sanitiza todo __html', (file) => {
    const source = readFileSync(join(FRONTEND_SRC, file), 'utf8');

    if (ALLOWLIST[file]) {
      expect(source).toMatch(SANITIZERS);
      return;
    }

    const values = [...source.matchAll(/__html:\s*([^\n]+)/g)].map((m) =>
      m[1].trim()
    );

    expect(values.length).toBeGreaterThan(0);
    expect(values.filter((v) => !SANITIZERS.test(v))).toEqual([]);
  });
});

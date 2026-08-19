import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Guarda de arquitetura do isolamento por perfil (Fase 2).
//
// Nao testa comportamento de um metodo: varre o CODIGO dos repositorios atras do
// padrao que ja causou vazamento entre clientes duas vezes —
//   OR: [{ profileId }, { profileId: null }]
// que faz um recurso sem perfil aparecer para TODOS os perfis do workspace.
//
// Existe porque os testes por-metodo so cobrem o que ja foi escrito. Este pega a
// reintroducao em QUALQUER repositorio, inclusive nos que ainda nao existem —
// que e exatamente como a brecha se espalhou de canais para midia.
const REPOS_DIR = join(__dirname, '..');

// Notificacoes sao a excecao legitima: ali `profileId: null` significa
// "notificacao da organizacao inteira" (assinatura, avisos globais), e o escopo
// soma org-wide + os perfis do usuario. Nao e recurso de cliente vazando.
const ALLOWLIST = ['notifications/notifications.repository.ts'];

function listRepositories(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return listRepositories(join(dir, entry.name), rel);
    }
    return entry.name.endsWith('.repository.ts') && !entry.name.endsWith('.spec.ts')
      ? [rel]
      : [];
  });
}

describe('Isolamento por perfil — guarda de arquitetura', () => {
  const repositories = listRepositories(REPOS_DIR).filter(
    (f) => !ALLOWLIST.includes(f)
  );

  it('encontra os repositorios para varrer (a varredura nao pode virar no-op)', () => {
    expect(repositories.length).toBeGreaterThan(10);
  });

  it.each(repositories)(
    '%s nao trata recurso sem perfil como visivel a todos',
    (file) => {
      const source = readFileSync(join(REPOS_DIR, file), 'utf8');

      // Normaliza espacos para pegar a variante quebrada em varias linhas.
      const flat = source.replace(/\s+/g, ' ');

      expect(flat).not.toMatch(/OR:\s*\[\s*\{\s*profileId\s*\}\s*,\s*\{\s*profileId:\s*null\s*\}/);
      expect(flat).not.toMatch(/OR:\s*\[\s*\{\s*profileId:\s*null\s*\}\s*,\s*\{\s*profileId\s*\}/);
    }
  );
});

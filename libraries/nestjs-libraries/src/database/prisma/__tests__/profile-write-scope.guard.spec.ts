import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

// Guarda de arquitetura: ESCRITA EM MASSA escopada por organizacao tem de ser
// escopada por perfil tambem.
//
// O padrao apareceu quatro vezes — webhooks, autopost, assinaturas e sets — e
// sempre igual: a LEITURA filtrava por perfil, a GRAVACAO nao. O `where` de um
// upsert decide QUAL registro e sobrescrito, e como o id vem do usuario
// (corpo ou rota), quem conhecesse o id do vizinho reescrevia o registro dele.
// updateMany/deleteMany sao piores em alcance: varrem varios de uma vez.
//
// Por que so estes tres metodos: `update`/`delete` por id lancam quando nao
// encontram e quase sempre vem depois de uma busca ja escopada. O upsert e o
// oposto — quando o `where` nao casa ele CRIA em silencio, entao a ausencia do
// filtro nao aparece como erro.
//
// So varre repositorio que ja conhece perfil (menciona `profileId`): se o
// arquivo nao sabe o que e perfil, o recurso e de organizacao.
const REPOS = join(__dirname, '..');
const ESCRITAS = ['upsert', 'updateMany', 'deleteMany'] as const;

// Excecoes legitimas, por `arquivo::metodo`. Numero de linha nao serve: muda.
const ALLOWLIST: Record<string, string> = {
  // Chave unica composta (organizationId_internalId) vinda do callback de
  // OAuth — o internalId e do provider, nao do usuario. O proprio metodo
  // resolve o perfil Default logo acima do upsert.
  'integrations/integration.repository.ts::createOrUpdateIntegration':
    'chave composta do provider; perfil resolvido no proprio metodo',

  // Chamadas internas do fluxo de refresh de token: o id vem do sistema.
  'integrations/integration.repository.ts::markRefreshNeeded':
    'chamada interna do refresh; id vem do sistema, nao do usuario',
  'integrations/integration.repository.ts::checkForDeletedOnceAndUpdate':
    'chamada interna; filtra por id de pagina do provider',

  // Recursos de ORGANIZACAO. Perfil nao se aplica.
  'organizations/organization.repository.ts::disableOrEnableNonSuperAdminUsers':
    'administracao da organizacao inteira, por definicao',
  'organizations/organization.repository.ts::deleteTeamMember':
    'remove o membro da organizacao inteira, por definicao',
  'subscriptions/subscription.repository.ts::createOrUpdateSubscription':
    'assinatura/billing e da organizacao; perfil nao se aplica',

  // PENDENTE — nao e excecao legitima, e lacuna conhecida e ainda aberta.
  // POST /integrations/:id/plugs recebe o id da integracao pela rota e NAO
  // injeta perfil nenhum (o controller nem usa @GetProfileFromRequest), entao
  // da para criar automacao no canal de outro perfil sabendo o id. Corrigir
  // exige escopar as tres rotas de plugs (GET, POST e activate) em
  // controller + service + repositorio, e nao cabia no mesmo PR que fechou a
  // classe de upsert. Esta aqui para o guard nao mentir sobre o estado atual.
  'integrations/integration.repository.ts::createOrUpdatePlug':
    'PENDENTE: superficie de plugs sem escopo de perfil',
};

const blocoBalanceado = (src: string, inicio: number): string => {
  let nivel = 0;
  for (let i = inicio; i < src.length; i += 1) {
    if (src[i] === '{') nivel += 1;
    else if (src[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return src.slice(inicio, i + 1);
    }
  }
  return src.slice(inicio);
};

const listar = (dir: string): string[] =>
  readdirSync(dir).flatMap((entrada) => {
    const completo = join(dir, entrada);
    return statSync(completo).isDirectory()
      ? listar(completo)
      : entrada.endsWith('.repository.ts')
      ? [completo]
      : [];
  });

const repositorios = listar(REPOS).filter((f) =>
  readFileSync(f, 'utf8').includes('profileId')
);

const METODO = /^  (?:async )?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;

const varrer = (arquivo: string): string[] => {
  const src = readFileSync(arquivo, 'utf8');
  const rel = relative(REPOS, arquivo).split(sep).join('/');
  const achados: string[] = [];

  for (const metodo of ESCRITAS) {
    const re = new RegExp(`\\.${metodo}\\(\\s*\\{`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const arg = blocoBalanceado(src, m.index + m[0].length - 1);
      const w = /where:\s*\{/.exec(arg);
      if (!w) continue;
      const where = blocoBalanceado(arg, w.index + w[0].length - 1);
      if (!where.includes('organizationId') || where.includes('profileId')) {
        continue;
      }
      METODO.lastIndex = 0;
      let dono = '?';
      let d: RegExpExecArray | null;
      while ((d = METODO.exec(src)) !== null && d.index < m.index) {
        dono = d[1];
      }
      const chave = `${rel}::${dono}`;
      if (!ALLOWLIST[chave]) achados.push(`${chave} (${metodo})`);
    }
  }
  return achados;
};

describe('Repositorios — escrita em massa escopada por perfil', () => {
  it('encontra repositorios para varrer (a varredura nao pode virar no-op)', () => {
    expect(repositorios.length).toBeGreaterThan(8);
  });

  it.each(repositorios.map((f) => [relative(REPOS, f).split(sep).join('/'), f]))(
    '%s',
    (_nome, arquivo: string) => {
      expect(varrer(arquivo)).toEqual([]);
    }
  );
});

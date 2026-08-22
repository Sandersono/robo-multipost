import { AutopostRepository } from './autopost.repository';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';

// Isolamento por perfil (Fase 2) no autopost.
//
// Mesmo defeito dos webhooks, com impacto diferente: o `upsert` de
// createAutopost filtrava por { id, organizationId } apenas, e PUT
// /autoposts/:id passa o id da URL direto. Como o ramo `update` NAO grava
// profileId, o autopost permanecia no perfil B — mas com url, titulo e conteudo
// escolhidos por quem esta no perfil A.
//
// O efeito pratico e pior que o roubo: o autopost segue publicando NOS CANAIS DE
// B (startAutopost resolve as integracoes por getPost.organizationId +
// getPost.profileId), so que com conteudo de A.
describe('AutopostRepository — isolamento por perfil', () => {
  let repo: AutopostRepository;
  let mock: ReturnType<typeof createPrismaRepositoryMock<'autoPost'>>;

  const body = {
    url: 'https://exemplo.com/feed.xml',
    title: 'Feed',
    integrations: [],
    active: true,
    content: '',
    generateContent: false,
    addPicture: false,
    syncLast: false,
    onSlot: false,
    lastUrl: '',
  } as any;

  beforeEach(() => {
    mock = createPrismaRepositoryMock('autoPost');
    mock.model.autoPost.findMany.mockResolvedValue([] as any);
    mock.model.autoPost.count.mockResolvedValue(0 as any);
    mock.model.autoPost.update.mockResolvedValue({ id: 'ap-1' } as any);
    mock.model.autoPost.upsert.mockResolvedValue({
      id: 'ap-1',
      active: true,
    } as any);

    repo = new AutopostRepository(mock as any);
  });

  describe('getAutoposts', () => {
    it('filtra pelo perfil ativo', async () => {
      await repo.getAutoposts('org-1', 'prof-A');

      const where = mock.model.autoPost.findMany.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
    });
  });

  describe('deleteAutopost', () => {
    it('nao apaga autopost fora do perfil ativo', async () => {
      await repo.deleteAutopost('org-1', 'ap-9', 'prof-A');

      const where = mock.model.autoPost.update.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
    });
  });

  describe('changeActive', () => {
    it('nao liga nem desliga autopost de outro perfil', async () => {
      await repo.changeActive('org-1', 'ap-9', false, 'prof-A');

      const where = mock.model.autoPost.update.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
    });
  });

  describe('createAutopost', () => {
    it('nao permite sobrescrever autopost de outro perfil pelo id', async () => {
      await repo.createAutopost('org-1', body, 'ap-do-perfil-B', 'prof-A');

      const where = mock.model.autoPost.upsert.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
    });

    it('sem perfil informado, mantem o escopo apenas por organizacao', async () => {
      await repo.createAutopost('org-1', body, 'ap-1');

      const where = mock.model.autoPost.upsert.mock.calls[0][0].where;
      expect(where.profileId).toBeUndefined();
      expect(where.organizationId).toBe('org-1');
    });
  });
});

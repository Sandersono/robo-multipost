import { MediaRepository } from './media.repository';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';

// Isolamento por perfil (Fase 2). A biblioteca de midia tinha o mesmo defeito
// dos canais: `profileId` nulo era exibido em TODOS os perfis. Numa agencia com
// clientes concorrentes, a midia de um cliente aparecia na biblioteca do outro —
// e o deleteMedia usava o mesmo filtro, entao um perfil podia APAGAR midia orfa.
describe('MediaRepository — isolamento estrito por perfil', () => {
  let repo: MediaRepository;
  let mediaMock: ReturnType<typeof createPrismaRepositoryMock<'media'>>;
  let profilesMock: ReturnType<typeof createPrismaRepositoryMock<'profile'>>;

  beforeEach(() => {
    mediaMock = createPrismaRepositoryMock('media');
    mediaMock.model.media.create.mockResolvedValue({ id: 'med-1' } as any);
    mediaMock.model.media.update.mockResolvedValue({ id: 'med-1' } as any);
    mediaMock.model.media.findMany.mockResolvedValue([] as any);
    mediaMock.model.media.count.mockResolvedValue(0 as any);

    profilesMock = createPrismaRepositoryMock('profile');
    profilesMock.model.profile.findFirst.mockResolvedValue({
      id: 'prof-default',
    } as any);

    repo = new MediaRepository(mediaMock as any, profilesMock as any);
  });

  describe('getMedia', () => {
    it('filtra estritamente pelo perfil, sem incluir midia orfa', async () => {
      await repo.getMedia('org-1', 1, 'prof-A');

      const where = mediaMock.model.media.findMany.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
      expect(where.OR).toBeUndefined();
    });

    it('sem perfil informado, nao restringe (chave de API de organizacao)', async () => {
      await repo.getMedia('org-1', 1);

      const where = mediaMock.model.media.findMany.mock.calls[0][0].where;
      expect(where.profileId).toBeUndefined();
      expect(where.OR).toBeUndefined();
    });
  });

  describe('deleteMedia', () => {
    it('nao permite apagar midia fora do perfil ativo', async () => {
      await repo.deleteMedia('org-1', 'med-9', 'prof-A');

      const where = mediaMock.model.media.update.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
      expect(where.OR).toBeUndefined();
    });
  });

  describe('saveFile', () => {
    it('usa o perfil informado quando ele existe', async () => {
      await repo.saveFile('org-1', 'f.png', '/f.png', 'orig.png', 'prof-A');

      const data = mediaMock.model.media.create.mock.calls[0][0].data;
      expect(data.profile).toEqual({ connect: { id: 'prof-A' } });
      expect(profilesMock.model.profile.findFirst).not.toHaveBeenCalled();
    });

    it('cai no perfil Default da org quando nenhum perfil e informado', async () => {
      await repo.saveFile('org-1', 'f.png', '/f.png', 'orig.png', undefined);

      expect(profilesMock.model.profile.findFirst).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', isDefault: true, deletedAt: null },
        select: { id: true },
      });
      const data = mediaMock.model.media.create.mock.calls[0][0].data;
      expect(data.profile).toEqual({ connect: { id: 'prof-default' } });
    });

    it('nao inventa perfil quando a org nao tem Default', async () => {
      profilesMock.model.profile.findFirst.mockResolvedValue(null as any);

      await repo.saveFile('org-1', 'f.png', '/f.png', 'orig.png', undefined);

      const data = mediaMock.model.media.create.mock.calls[0][0].data;
      expect(data.profile).toBeUndefined();
    });
  });
});

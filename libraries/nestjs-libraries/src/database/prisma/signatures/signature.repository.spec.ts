import { SignatureRepository } from './signature.repository';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';

// Isolamento por perfil (Fase 2) nas assinaturas. Dois defeitos distintos:
//
// 1. O `upsert` filtrava por { id, organizationId } — sem perfil. Como
//    PUT /signatures/:id passa o id da rota e o ramo `update` grava o
//    profileId ativo, quem conhecesse o id da assinatura do perfil vizinho a
//    reescrevia e a trazia para si. Mesmo defeito de webhooks e autopost.
//
// 2. Pior, porque nao precisa de ataque nenhum: ao marcar uma assinatura como
//    padrao, o updateMany que desmarca as demais varria a ORGANIZACAO inteira
//    (`where: { organizationId, id: { not } }`). Numa agencia cujos clientes
//    sao perfis da mesma org, um cliente marcando a propria assinatura como
//    padrao desmarcava silenciosamente a de TODOS os outros. Nao era exploracao
//    — era o fluxo normal da tela.
describe('SignatureRepository — isolamento por perfil', () => {
  let repo: SignatureRepository;
  let mock: ReturnType<typeof createPrismaRepositoryMock<'signatures'>>;

  const body = { content: '<p>ass</p>', autoAdd: false } as any;

  beforeEach(() => {
    mock = createPrismaRepositoryMock('signatures');
    mock.model.signatures.findMany.mockResolvedValue([] as any);
    mock.model.signatures.findFirst.mockResolvedValue(null as any);
    mock.model.signatures.update.mockResolvedValue({ id: 'sig-1' } as any);
    mock.model.signatures.updateMany.mockResolvedValue({ count: 0 } as any);
    mock.model.signatures.upsert.mockResolvedValue({
      id: 'sig-1',
      profileId: 'prof-A',
    } as any);

    repo = new SignatureRepository(mock as any);
  });

  describe('getSignaturesByOrgId', () => {
    it('filtra pelo perfil ativo', async () => {
      await repo.getSignaturesByOrgId('org-1', 'prof-A');

      const where = mock.model.signatures.findMany.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
    });
  });

  describe('deleteSignature', () => {
    it('nao apaga assinatura fora do perfil ativo', async () => {
      await repo.deleteSignature('org-1', 'sig-9', 'prof-A');

      const where = mock.model.signatures.update.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
    });
  });

  describe('createOrUpdateSignature', () => {
    it('nao permite sobrescrever assinatura de outro perfil pelo id', async () => {
      await repo.createOrUpdateSignature('org-1', body, 'sig-do-perfil-B', 'prof-A');

      const where = mock.model.signatures.upsert.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
    });

    it('marcar como padrao nao desmarca a assinatura de outros perfis', async () => {
      await repo.createOrUpdateSignature(
        'org-1',
        { content: '<p>ass</p>', autoAdd: true } as any,
        'sig-1',
        'prof-A'
      );

      const where = mock.model.signatures.updateMany.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
      expect(where.organizationId).toBe('org-1');
    });

    it('nao desmarca nada quando a assinatura nao e padrao', async () => {
      await repo.createOrUpdateSignature('org-1', body, 'sig-1', 'prof-A');

      expect(mock.model.signatures.updateMany).not.toHaveBeenCalled();
    });
  });
});

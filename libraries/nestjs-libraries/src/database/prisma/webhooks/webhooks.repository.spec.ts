import { WebhooksRepository } from './webhooks.repository';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';

// Isolamento por perfil (Fase 2) nos webhooks de saida.
//
// A leitura ja era escopada, mas o `upsert` de createWebhook filtrava apenas por
// { id, organizationId } — sem o perfil. Como PUT /webhooks recebe o `id` no
// corpo (UpdateDto.id e obrigatorio) e o ramo `update` grava o profileId do
// perfil ATIVO, um membro do perfil A que conhecesse o id de um webhook do
// perfil B da mesma organizacao reescrevia a URL dele e o trazia para si.
//
// Nao era enumeravel — getWebhooks e filtrado por perfil, entao A nao lista os
// webhooks de B — mas basta o id vazar uma vez. Numa agencia cujos clientes sao
// perfis da MESMA org, e escrita cruzando exatamente a fronteira que a camada de
// perfis existe para proteger.
describe('WebhooksRepository — isolamento por perfil', () => {
  let repo: WebhooksRepository;
  let mock: ReturnType<typeof createPrismaRepositoryMock<'webhooks'>>;

  const body = {
    id: 'wh-do-perfil-B',
    name: 'n8n',
    url: 'https://exemplo.com/hook',
    integrations: [],
  } as any;

  beforeEach(() => {
    mock = createPrismaRepositoryMock('webhooks');
    mock.model.webhooks.findMany.mockResolvedValue([] as any);
    mock.model.webhooks.count.mockResolvedValue(0 as any);
    mock.model.webhooks.update.mockResolvedValue({ id: 'wh-1' } as any);
    mock.model.webhooks.upsert.mockResolvedValue({ id: 'wh-1' } as any);

    repo = new WebhooksRepository(mock as any);
  });

  describe('getWebhooks', () => {
    it('filtra pelo perfil ativo', async () => {
      await repo.getWebhooks('org-1', 'prof-A');

      const where = mock.model.webhooks.findMany.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
      expect(where.organizationId).toBe('org-1');
    });

    it('sem perfil informado, nao restringe (admin da org / chave de API)', async () => {
      await repo.getWebhooks('org-1');

      const where = mock.model.webhooks.findMany.mock.calls[0][0].where;
      expect(where.profileId).toBeUndefined();
    });
  });

  describe('deleteWebhook', () => {
    it('nao apaga webhook fora do perfil ativo', async () => {
      await repo.deleteWebhook('org-1', 'wh-9', 'prof-A');

      const where = mock.model.webhooks.update.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
    });
  });

  describe('createWebhook', () => {
    it('nao permite sobrescrever webhook de outro perfil pelo id', async () => {
      await repo.createWebhook('org-1', body, 'prof-A');

      const where = mock.model.webhooks.upsert.mock.calls[0][0].where;
      expect(where.profileId).toBe('prof-A');
    });

    it('sem perfil informado, mantem o escopo apenas por organizacao', async () => {
      await repo.createWebhook('org-1', body);

      const where = mock.model.webhooks.upsert.mock.calls[0][0].where;
      expect(where.profileId).toBeUndefined();
      expect(where.organizationId).toBe('org-1');
    });
  });
});

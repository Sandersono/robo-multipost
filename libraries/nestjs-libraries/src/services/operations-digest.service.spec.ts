jest.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({
  ssrfSafeDispatcher: { __mock: 'dispatcher' },
}));

import {
  OperationsDigestService,
  OPERATIONS_DIGEST_EVENT,
} from './operations-digest.service';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';
import { StatusProblemsResponse } from '@gitroom/nestjs-libraries/dtos/status/status.dto';

const semProblema = (): StatusProblemsResponse => ({
  channels: [],
  posts: [],
  automations: [],
  summary: { critical: 0, warning: 0, total: 0, truncated: false },
});

const comProblema = (): StatusProblemsResponse => ({
  channels: [
    {
      type: 'channel',
      severity: 'critical',
      id: 'int-1',
      identifier: 'instagram',
      internalId: 'ig-1',
      name: 'Instagram Cliente A',
      picture: null,
      refreshNeeded: true,
      disabled: false,
      reason: 'invalid_grant',
      reasonAt: '2026-11-25T10:00:00.000Z',
      profile: { id: 'prof-A', name: 'Cliente A' },
    },
  ],
  posts: [
    {
      type: 'post',
      severity: 'critical',
      id: 'post-9',
      updatedAt: '2026-11-25T09:00:00.000Z',
      channel: null,
      profile: { id: 'prof-A', name: 'Cliente A' },
    },
  ],
  automations: [
    {
      type: 'automation',
      severity: 'warning',
      id: 'exec-1',
      flowId: 'flow-1',
      flowName: 'Comentario -> WhatsApp',
      error: 'Plug not found',
      profile: { id: 'prof-A', name: 'Cliente A' },
    },
  ],
  summary: { critical: 2, warning: 1, total: 3, truncated: false },
});

describe('OperationsDigestService', () => {
  let service: OperationsDigestService;
  let status: { getProblems: jest.Mock };
  let webhooks: { getWebhooks: jest.Mock };
  let profiles: ReturnType<typeof createPrismaRepositoryMock<'profile'>>;
  let temporal: any;
  let fetchMock: jest.Mock;

  const umPerfil = [
    {
      id: 'prof-A',
      name: 'Cliente A',
      organizationId: 'org-1',
      whatsappPhone: '5511999999999',
    },
  ];

  beforeEach(() => {
    status = { getProblems: jest.fn().mockResolvedValue(comProblema()) };
    webhooks = {
      getWebhooks: jest
        .fn()
        .mockResolvedValue([{ url: 'https://n8n.local/hook' }]),
    };
    profiles = createPrismaRepositoryMock('profile');
    profiles.model.profile.findMany.mockResolvedValue(umPerfil as any);

    temporal = {
      client: { getRawClient: () => ({ workflow: { start: jest.fn() } }) },
    };

    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as any).fetch = fetchMock;

    service = new OperationsDigestService(
      status as any,
      webhooks as any,
      profiles as any,
      temporal as any
    );
  });

  describe('sendDigests', () => {
    it('monta o resumo por perfil, nao pela organizacao', async () => {
      await service.sendDigests();

      expect(status.getProblems).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'org-1' }),
        'prof-A'
      );
      expect(webhooks.getWebhooks).toHaveBeenCalledWith('org-1', 'prof-A');
    });

    // Avisar "tudo ok" tres vezes por dia treina quem recebe a ignorar a
    // mensagem. O resumo so sai quando ha algo para fazer.
    it('nao manda nada quando o perfil nao tem problema', async () => {
      status.getProblems.mockResolvedValue(semProblema());

      const r = await service.sendDigests();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(r).toEqual({ profiles: 1, dispatched: 0 });
    });

    it('nao consulta webhook a mais quando nao ha problema', async () => {
      status.getProblems.mockResolvedValue(semProblema());

      await service.sendDigests();

      expect(webhooks.getWebhooks).not.toHaveBeenCalled();
    });

    it('nao manda quando o perfil tem problema mas nenhum webhook', async () => {
      webhooks.getWebhooks.mockResolvedValue([]);

      const r = await service.sendDigests();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(r).toEqual({ profiles: 1, dispatched: 0 });
    });

    it('envia o resumo com contagens e itens acionaveis', async () => {
      const r = await service.sendDigests();

      expect(r).toEqual({ profiles: 1, dispatched: 1 });
      const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(payload.event).toBe(OPERATIONS_DIGEST_EVENT);
      expect(payload.profileName).toBe('Cliente A');
      expect(payload.whatsappPhone).toBe('5511999999999');
      expect(payload.summary).toEqual({
        critical: 2,
        warning: 1,
        total: 3,
        truncated: false,
      });
      expect(payload.channels[0]).toEqual({
        name: 'Instagram Cliente A',
        identifier: 'instagram',
        severity: 'critical',
        reason: 'invalid_grant',
      });
      expect(payload.posts[0]).toEqual({ id: 'post-9', channel: null });
      expect(payload.automations[0]).toEqual({
        flowId: 'flow-1',
        flowName: 'Comentario -> WhatsApp',
        error: 'Plug not found',
      });
      expect(typeof payload.generatedAt).toBe('string');
    });

    it('usa o dispatcher anti-SSRF no envio', async () => {
      await service.sendDigests();

      expect(fetchMock.mock.calls[0][1].dispatcher).toEqual({
        __mock: 'dispatcher',
      });
    });

    // O resumo e do PERFIL, nao de um canal — todo webhook do perfil recebe,
    // sem o filtro por integracao que o alerta por evento aplica.
    it('manda para todos os webhooks do perfil', async () => {
      webhooks.getWebhooks.mockResolvedValue([
        { url: 'https://um.local/hook', integrations: [{ integration: { id: 'x' } }] },
        { url: 'https://dois.local/hook', integrations: [] },
      ]);

      await service.sendDigests();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('cap de itens no payload — o resumo e aviso, nao a tela', async () => {
      const muitos = comProblema();
      muitos.posts = Array.from({ length: 30 }, (_, i) => ({
        ...muitos.posts[0],
        id: `post-${i}`,
      }));
      status.getProblems.mockResolvedValue(muitos);

      await service.sendDigests();

      const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(payload.posts.length).toBeLessThanOrEqual(5);
      expect(payload.summary.total).toBe(3);
    });

    it('um perfil que falha nao impede o resumo dos outros', async () => {
      profiles.model.profile.findMany.mockResolvedValue([
        ...umPerfil,
        {
          id: 'prof-B',
          name: 'Cliente B',
          organizationId: 'org-1',
          whatsappPhone: null,
        },
      ] as any);
      status.getProblems
        .mockRejectedValueOnce(new Error('db down'))
        .mockResolvedValueOnce(comProblema());

      const r = await service.sendDigests();

      expect(r).toEqual({ profiles: 2, dispatched: 1 });
    });

    it('webhook fora do ar nao derruba o ciclo (fail-soft)', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const r = await service.sendDigests();

      expect(r).toEqual({ profiles: 1, dispatched: 0 });
    });
  });

  describe('ensureWorkflow', () => {
    it('inicia o singleton com USE_EXISTING (idempotente no boot)', async () => {
      const start = jest.fn();
      temporal.client.getRawClient = () => ({ workflow: { start } });

      await service.ensureWorkflow(6);

      expect(start).toHaveBeenCalledWith(
        'operationsDigestWorkflow',
        expect.objectContaining({
          workflowId: 'operations-digest',
          taskQueue: 'main',
          workflowIdConflictPolicy: 'USE_EXISTING',
          args: [{ intervalHours: 6 }],
        })
      );
    });
  });
});

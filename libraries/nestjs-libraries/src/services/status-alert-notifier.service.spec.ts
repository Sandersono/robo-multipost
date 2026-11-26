jest.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({
  ssrfSafeDispatcher: { __mock: 'dispatcher' },
}));

import {
  StatusAlertNotifierService,
  STATUS_EVENT_WEBHOOK_EVENTS,
} from './status-alert-notifier.service';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';

describe('StatusAlertNotifierService', () => {
  let service: StatusAlertNotifierService;
  let webhooks: { getWebhooks: jest.Mock };
  let profiles: ReturnType<typeof createPrismaRepositoryMock<'profile'>>;
  let fetchMock: jest.Mock;

  const input = (over: Partial<any> = {}) => ({
    organizationId: 'org-1',
    profileId: 'prof-A',
    type: 'CHANNEL_DISCONNECT' as const,
    severity: 'CRITICAL' as const,
    message: 'ApplicationFailure: expired',
    integrationId: 'int-1',
    channelName: 'Instagram Cliente',
    providerIdentifier: 'instagram',
    entityId: 'int-1',
    ...over,
  });

  beforeEach(() => {
    webhooks = { getWebhooks: jest.fn().mockResolvedValue([]) };
    profiles = createPrismaRepositoryMock('profile');
    profiles.model.profile.findFirst.mockResolvedValue({
      id: 'prof-A',
      name: 'Cliente A',
      whatsappPhone: '5511999999999',
    } as any);

    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    (global as any).fetch = fetchMock;

    service = new StatusAlertNotifierService(webhooks as any, profiles as any);
  });

  it('busca webhooks escopados no perfil, nao na organizacao inteira', async () => {
    await service.notifyStatusEvent(input());

    expect(webhooks.getWebhooks).toHaveBeenCalledWith('org-1', 'prof-A');
  });

  it('nao dispara nada quando o perfil nao tem webhook', async () => {
    const result = await service.notifyStatusEvent(input());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, total: 0 });
  });

  it.each([
    ['CHANNEL_DISCONNECT', 'canal.desconectado'],
    ['POST_FAILED', 'post.falhou'],
    ['AUTOMATION_FAILED', 'automacao.falhou'],
  ])('traduz o tipo %s para o evento %s', async (type, evento) => {
    webhooks.getWebhooks.mockResolvedValue([
      { url: 'https://n8n.local/hook', integrations: [] },
    ]);

    await service.notifyStatusEvent(input({ type }));

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.event).toBe(evento);
    expect(STATUS_EVENT_WEBHOOK_EVENTS[type as never]).toBe(evento);
  });

  it('leva severity no payload — quem consome decide se avisa na hora', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      { url: 'https://n8n.local/hook', integrations: [] },
    ]);

    await service.notifyStatusEvent(input({ severity: 'WARNING' }));

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.severity).toBe('WARNING');
  });

  it('leva canal, perfil e telefone para a mensagem ser acionavel', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      { url: 'https://n8n.local/hook', integrations: [] },
    ]);

    const result = await service.notifyStatusEvent(input());

    expect(result).toEqual({ sent: 1, total: 1 });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.channelName).toBe('Instagram Cliente');
    expect(payload.providerIdentifier).toBe('instagram');
    expect(payload.profileName).toBe('Cliente A');
    expect(payload.whatsappPhone).toBe('5511999999999');
    expect(payload.entityId).toBe('int-1');
    expect(typeof payload.occurredAt).toBe('string');
  });

  it('usa o dispatcher anti-SSRF no envio', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      { url: 'https://n8n.local/hook', integrations: [] },
    ]);

    await service.notifyStatusEvent(input());

    expect(fetchMock.mock.calls[0][1].dispatcher).toEqual({
      __mock: 'dispatcher',
    });
  });

  it('respeita o filtro por integracao do webhook', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      {
        url: 'https://n8n.local/outro-canal',
        integrations: [{ integration: { id: 'int-OUTRA' } }],
      },
    ]);

    const result = await service.notifyStatusEvent(input());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, total: 0 });
  });

  it('evento sem integracao vai para todos os webhooks do perfil', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      {
        url: 'https://n8n.local/canal-especifico',
        integrations: [{ integration: { id: 'int-OUTRA' } }],
      },
    ]);

    const result = await service.notifyStatusEvent(
      input({ integrationId: null })
    );

    expect(result).toEqual({ sent: 1, total: 1 });
  });

  it('webhook fora do ar nao derruba os outros (fail-soft)', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      { url: 'https://caiu.local/hook', integrations: [] },
      { url: 'https://ok.local/hook', integrations: [] },
    ]);
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: true });

    const result = await service.notifyStatusEvent(input());

    expect(result).toEqual({ sent: 1, total: 2 });
  });

  it('evento sem perfil nao consulta perfil e vai sem telefone', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      { url: 'https://n8n.local/hook', integrations: [] },
    ]);

    await service.notifyStatusEvent(input({ profileId: null }));

    expect(profiles.model.profile.findFirst).not.toHaveBeenCalled();
    expect(webhooks.getWebhooks).toHaveBeenCalledWith('org-1', undefined);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.profileName).toBeNull();
    expect(payload.whatsappPhone).toBeNull();
  });
});

jest.mock('@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher', () => ({
  ssrfSafeDispatcher: { __mock: 'dispatcher' },
}));

import {
  ApprovalNotifierService,
  APPROVAL_REQUESTED_EVENT,
} from './approval-notifier.service';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';

describe('ApprovalNotifierService', () => {
  let service: ApprovalNotifierService;
  let webhooks: { getWebhooks: jest.Mock };
  let profiles: ReturnType<typeof createPrismaRepositoryMock<'profile'>>;
  let fetchMock: jest.Mock;

  const input = (over: Partial<any> = {}) => ({
    organizationId: 'org-1',
    profileId: 'prof-A',
    post: {
      id: 'post-1',
      content: 'conteudo do post',
      publishDate: new Date('2026-09-01T12:00:00Z'),
      integrationId: 'int-1',
      integrationName: 'Instagram Cliente',
    },
    reviewUrl: 'https://app.postcast.com.br/p/post-1',
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

    service = new ApprovalNotifierService(webhooks as any, profiles as any);
  });

  it('busca webhooks escopados no perfil, nao na organizacao inteira', async () => {
    await service.notifyApprovalRequested(input());

    expect(webhooks.getWebhooks).toHaveBeenCalledWith('org-1', 'prof-A');
  });

  it('nao dispara nada quando o perfil nao tem webhook', async () => {
    webhooks.getWebhooks.mockResolvedValue([]);

    const result = await service.notifyApprovalRequested(input());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, total: 0 });
  });

  it('envia o evento com telefone e nome do perfil no payload', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      { url: 'https://n8n.local/hook', integrations: [] },
    ]);

    const result = await service.notifyApprovalRequested(input());

    expect(result).toEqual({ sent: 1, total: 1 });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://n8n.local/hook');
    const payload = JSON.parse(options.body);
    expect(payload.event).toBe(APPROVAL_REQUESTED_EVENT);
    expect(payload.postId).toBe('post-1');
    expect(payload.profileName).toBe('Cliente A');
    expect(payload.whatsappPhone).toBe('5511999999999');
    expect(payload.reviewUrl).toBe('https://app.postcast.com.br/p/post-1');
    expect(payload.integrationName).toBe('Instagram Cliente');
  });

  it('usa o dispatcher anti-SSRF no envio', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      { url: 'https://n8n.local/hook', integrations: [] },
    ]);

    await service.notifyApprovalRequested(input());

    expect(fetchMock.mock.calls[0][1].dispatcher).toEqual({
      __mock: 'dispatcher',
    });
  });

  it('trunca o conteudo — o webhook e aviso, nao canal de distribuicao', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      { url: 'https://n8n.local/hook', integrations: [] },
    ]);

    await service.notifyApprovalRequested(
      input({
        post: {
          id: 'post-1',
          content: 'x'.repeat(1000),
          publishDate: new Date(),
          integrationId: 'int-1',
        },
      })
    );

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.contentPreview.length).toBeLessThanOrEqual(280);
  });

  it('respeita o filtro por integracao do webhook', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      {
        url: 'https://n8n.local/outro-canal',
        integrations: [{ integration: { id: 'int-OUTRA' } }],
      },
    ]);

    const result = await service.notifyApprovalRequested(input());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, total: 0 });
  });

  it('webhook fora do ar nao derruba o envio (fail-soft)', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      { url: 'https://caiu.local/hook', integrations: [] },
      { url: 'https://ok.local/hook', integrations: [] },
    ]);
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce({ ok: true });

    const result = await service.notifyApprovalRequested(input());

    expect(result).toEqual({ sent: 1, total: 2 });
  });

  it('post sem perfil nao consulta perfil e vai sem telefone', async () => {
    webhooks.getWebhooks.mockResolvedValue([
      { url: 'https://n8n.local/hook', integrations: [] },
    ]);

    await service.notifyApprovalRequested(input({ profileId: null }));

    expect(profiles.model.profile.findFirst).not.toHaveBeenCalled();
    expect(webhooks.getWebhooks).toHaveBeenCalledWith('org-1', undefined);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.whatsappPhone).toBeNull();
    expect(payload.profileName).toBeNull();
  });
});

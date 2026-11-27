import 'reflect-metadata';
// IntegrationManager importa todos os providers (nostr-tools e ESM e quebra o
// parse do jest); o service so precisa do tipo.
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));
jest.mock('nestjs-temporal-core', () => ({
  TemporalService: class {},
}));
import { createMock } from '@gitroom/nestjs-libraries/test';
import { FlowsService } from './flows.service';
import { FlowsRepository } from './flows.repository';
import { TemporalService } from 'nestjs-temporal-core';
import { IntegrationService } from '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import { CredentialService } from '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service';
import { InstagramMessagingService } from '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service';
import { ProfileService } from '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service';
import { EncryptionService } from '@gitroom/nestjs-libraries/crypto/encryption.service';
import { StatusEventService } from '@gitroom/nestjs-libraries/database/prisma/status/status-event.service';

describe('FlowsService.checkIntegrationWebhook - inscricao da Pagina', () => {
  let service: FlowsService;
  let integrationService: ReturnType<typeof createMock<IntegrationService>>;
  let integrationManager: ReturnType<typeof createMock<IntegrationManager>>;
  let credentialService: ReturnType<typeof createMock<CredentialService>>;
  let provider: {
    getPageIdForIgAccount: jest.Mock;
    checkPageSubscription: jest.Mock;
  };
  let originalFetch: typeof fetch;

  beforeEach(() => {
    integrationService = createMock<IntegrationService>();
    integrationManager = createMock<IntegrationManager>();
    credentialService = createMock<CredentialService>();
    provider = {
      getPageIdForIgAccount: jest.fn().mockResolvedValue('PAGE1'),
      checkPageSubscription: jest.fn(),
    };

    integrationService.getIntegrationById.mockResolvedValue({
      id: 'int-1',
      organizationId: 'org-1',
      profileId: null,
      providerIdentifier: 'instagram',
      internalId: 'IG1',
      token: 'PTOKEN',
    } as any);
    integrationManager.getSocialIntegration.mockReturnValue(provider as any);
    credentialService.getRawShared.mockResolvedValue({
      clientId: '2046',
      clientSecret: 'secret',
    } as any);

    // Camada do app: webhook instagram ativo com comments e messages.
    originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        data: [
          {
            object: 'instagram',
            callback_url: 'https://x/webhook',
            active: true,
            fields: [{ name: 'comments' }, { name: 'messages' }],
          },
        ],
      }),
    }) as any;

    service = new FlowsService(
      createMock<FlowsRepository>(),
      createMock<TemporalService>(),
      integrationService,
      integrationManager,
      credentialService,
      createMock<InstagramMessagingService>(),
      createMock<ProfileService>(),
      createMock<EncryptionService>(),
      createMock<StatusEventService>()
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('deve dar ok quando a Pagina esta inscrita no app', async () => {
    provider.checkPageSubscription.mockResolvedValue({
      subscribed: true,
      fields: ['feed'],
    });

    const result = await service.checkIntegrationWebhook('org-1', 'int-1');

    expect(provider.checkPageSubscription).toHaveBeenCalledWith(
      'PAGE1',
      'PTOKEN',
      '2046'
    );
    expect(result).toMatchObject({ ok: true, pageSubscribed: true });
  });

  it('deve mostrar nao inscrita quando o app falta na Pagina', async () => {
    provider.checkPageSubscription.mockResolvedValue({
      subscribed: false,
      fields: [],
    });

    const result = await service.checkIntegrationWebhook('org-1', 'int-1');

    expect(result.ok).toBe(false);
    expect(result.pageSubscribed).toBe(false);
    expect(result.error).toContain('não inscrita');
  });

  it('deve avisar sem bloquear quando a inscricao nao pode ser lida', async () => {
    provider.checkPageSubscription.mockResolvedValue({
      subscribed: null,
      fields: [],
      error: 'requires pages_manage_metadata',
    });

    const result = await service.checkIntegrationWebhook('org-1', 'int-1');

    expect(result.ok).toBe(true);
    expect(result.pageSubscribed).toBeNull();
    expect(result.warning).toContain('pages_manage_metadata');
  });

  it('nao deve checar a Pagina quando o webhook do app ja falhou', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        data: [
          { object: 'instagram', callback_url: '', active: false, fields: [] as string[] },
        ],
      }),
    }) as any;

    const result = await service.checkIntegrationWebhook('org-1', 'int-1');

    expect(result.ok).toBe(false);
    expect(provider.checkPageSubscription).not.toHaveBeenCalled();
  });
});

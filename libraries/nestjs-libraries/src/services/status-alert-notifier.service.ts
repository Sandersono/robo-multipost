import { Injectable } from '@nestjs/common';
import { StatusEventSeverity, StatusEventType } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

/**
 * Nome do evento por tipo de falha. Convencao pt-BR pontuada, igual ao
 * `post.aguardando_aprovacao` — quem consome filtra por string.
 */
export const STATUS_EVENT_WEBHOOK_EVENTS: Record<StatusEventType, string> = {
  CHANNEL_DISCONNECT: 'canal.desconectado',
  POST_FAILED: 'post.falhou',
  AUTOMATION_FAILED: 'automacao.falhou',
};

export type StatusAlertInput = {
  organizationId: string;
  type: StatusEventType;
  severity: StatusEventSeverity;
  message?: string | null;
  profileId?: string | null;
  integrationId?: string | null;
  channelName?: string | null;
  providerIdentifier?: string | null;
  entityId?: string | null;
};

/**
 * Empurra falha de dominio para os webhooks de saida DO PERFIL, para quem opera
 * a agencia nao depender de abrir a tela para descobrir que um canal emudeceu.
 *
 * Os tres tipos sao emitidos, e a `severity` vai no payload: o app avisa, quem
 * consome decide se vira WhatsApp na hora ou entra no resumo. Mesma postura do
 * `ApprovalNotifierService` ("emite o evento e quem consome escolhe o canal").
 *
 * Fail-soft por design: alerta que falha nao pode mascarar nem derrubar a
 * operacao real (publicacao, refresh de token, execucao de automacao).
 */
@Injectable()
export class StatusAlertNotifierService {
  constructor(
    private _webhooks: WebhooksService,
    private _profiles: PrismaRepository<'profile'>
  ) {}

  async notifyStatusEvent(input: StatusAlertInput) {
    const profile = input.profileId
      ? await this._profiles.model.profile.findFirst({
          where: { id: input.profileId },
          select: { id: true, name: true, whatsappPhone: true },
        })
      : null;

    // Escopado por perfil: o webhook de um cliente nunca recebe falha de outro.
    const webhooks = await this._webhooks.getWebhooks(
      input.organizationId,
      input.profileId ?? undefined
    );

    // Webhook sem integracao declarada recebe tudo. Com integracoes, so recebe
    // quando a falha e do canal dele — ou quando a falha nao tem canal (ex.:
    // automacao sem integracao resolvida), caso em que todos recebem.
    const targets = webhooks.filter(
      (w: any) =>
        w.integrations?.length === 0 ||
        !input.integrationId ||
        w.integrations?.some(
          (i: any) => i.integration?.id === input.integrationId
        )
    );

    if (!targets.length) {
      return { sent: 0, total: 0 };
    }

    const body = JSON.stringify({
      event: STATUS_EVENT_WEBHOOK_EVENTS[input.type],
      type: input.type,
      severity: input.severity,
      // Mensagem ja chega SANITIZADA e capada pelo StatusEventService — nunca o
      // corpo cru da excecao, que poderia conter token.
      message: input.message ?? null,
      channelName: input.channelName ?? null,
      providerIdentifier: input.providerIdentifier ?? null,
      entityId: input.entityId ?? null,
      profileId: profile?.id ?? null,
      profileName: profile?.name ?? null,
      whatsappPhone: profile?.whatsappPhone ?? null,
      occurredAt: new Date().toISOString(),
    });

    const results = await Promise.all(
      targets.map(async (webhook: any) => {
        try {
          await fetch(webhook.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            // A URL passa por @IsSafeWebhookUrl na criacao, mas o disparo ocorre
            // muito depois e o fetch re-resolve o DNS — o dispatcher fecha a
            // janela de DNS-rebinding (SSRF) no momento do envio.
            // @ts-ignore — `dispatcher` e opcao do undici, ausente dos tipos do fetch
            dispatcher: ssrfSafeDispatcher,
          });
          return true;
        } catch (e) {
          return false;
        }
      })
    );

    return { sent: results.filter(Boolean).length, total: targets.length };
  }
}

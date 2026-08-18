import { Injectable } from '@nestjs/common';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

export const APPROVAL_REQUESTED_EVENT = 'post.aguardando_aprovacao';

// Quanto do conteudo vai no payload. O webhook e um aviso ("post X do cliente Y
// esta aguardando voce"), nao um canal de distribuicao do post — o conteudo
// integral fica na aplicacao, atras de autenticacao.
const CONTENT_PREVIEW_CHARS = 280;

export type ApprovalNotificationInput = {
  organizationId: string;
  profileId: string | null;
  post: {
    id: string;
    content: string;
    publishDate: Date;
    integrationId?: string | null;
    integrationName?: string | null;
  };
  reviewUrl?: string | null;
};

/**
 * Dispara o aviso de "post aguardando aprovacao" nos webhooks de saida do
 * perfil. O destino tipico e um fluxo do n8n que manda WhatsApp pela Evolution
 * API, mas o app nao sabe disso: emite o evento e quem consome decide o canal.
 *
 * Fail-soft por design: webhook fora do ar NAO pode impedir a equipe de enviar
 * um post para aprovacao. Mesma postura do disparo de publicacao
 * (post.activity.ts sendWebhooks) e do fail-soft do avatar na conexao de canal.
 */
@Injectable()
export class ApprovalNotifierService {
  constructor(
    private _webhooks: WebhooksService,
    private _profiles: PrismaRepository<'profile'>
  ) {}

  async notifyApprovalRequested(input: ApprovalNotificationInput) {
    const profile = input.profileId
      ? await this._profiles.model.profile.findFirst({
          where: { id: input.profileId },
          select: { id: true, name: true, whatsappPhone: true },
        })
      : null;

    // Escopado por perfil: o webhook de um cliente nunca recebe post de outro.
    // O disparo de publicacao usa getWebhooks(orgId) sem perfil e depende so do
    // filtro por integracao — aqui passamos o perfil de proposito.
    const webhooks = await this._webhooks.getWebhooks(
      input.organizationId,
      input.profileId ?? undefined
    );

    const targets = webhooks.filter(
      (w: any) =>
        w.integrations?.length === 0 ||
        !input.post.integrationId ||
        w.integrations?.some(
          (i: any) => i.integration?.id === input.post.integrationId
        )
    );

    if (!targets.length) {
      return { sent: 0, total: 0 };
    }

    const body = JSON.stringify({
      event: APPROVAL_REQUESTED_EVENT,
      postId: input.post.id,
      publishDate: input.post.publishDate,
      contentPreview: (input.post.content || '')
        .slice(0, CONTENT_PREVIEW_CHARS)
        .trim(),
      integrationName: input.post.integrationName ?? null,
      profileId: profile?.id ?? null,
      profileName: profile?.name ?? null,
      whatsappPhone: profile?.whatsappPhone ?? null,
      reviewUrl: input.reviewUrl ?? null,
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

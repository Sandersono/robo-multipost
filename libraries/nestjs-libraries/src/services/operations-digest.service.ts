import { Injectable, Logger } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { TemporalService } from 'nestjs-temporal-core';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { StatusService } from '@gitroom/nestjs-libraries/database/prisma/status/status.service';
import { WebhooksService } from '@gitroom/nestjs-libraries/database/prisma/webhooks/webhooks.service';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

export const OPERATIONS_DIGEST_EVENT = 'resumo.operacional';
export const OPERATIONS_DIGEST_WORKFLOW_ID = 'operations-digest';

// Quantos itens de cada tipo vao no payload. O resumo e aviso ("3 coisas
// pedem voce no Cliente A"), nao a tela de Status — a lista integral fica na
// aplicacao, atras de autenticacao. `summary` sempre leva os numeros reais.
const ITEMS_PER_KIND = 5;

type DigestProfile = {
  id: string;
  name: string;
  organizationId: string;
  whatsappPhone: string | null;
};

export type OperationsDigestResult = { profiles: number; dispatched: number };

/**
 * Resumo operacional empurrado para os webhooks de saida DE CADA PERFIL, para
 * quem opera a agencia descobrir o que precisa dele sem abrir a plataforma.
 *
 * Reusa o `StatusService.getProblems`, que ja agrega canal precisando
 * reconectar, post em erro e automacao que falhou — e ja e escopado por perfil.
 *
 * Diferenca proposital em relacao ao alerta por evento
 * (`StatusAlertNotifierService`): ali o disparo e por FALHA e respeita o filtro
 * por integracao do webhook; aqui o disparo e por PERFIL, e todo webhook do
 * perfil recebe — o resumo nao e de um canal.
 */
@Injectable()
export class OperationsDigestService {
  private readonly logger = new Logger(OperationsDigestService.name);

  constructor(
    private _statusService: StatusService,
    private _webhooks: WebhooksService,
    private _profiles: PrismaRepository<'profile'>,
    private _temporalService: TemporalService
  ) {}

  /**
   * Garante o workflow SINGLETON do resumo. Idempotente via
   * `workflowIdConflictPolicy: USE_EXISTING` (no-op quando ja roda), para ser
   * chamado no boot sem duplicar — mesmo padrao do `refresh-tokens-cron`.
   */
  async ensureWorkflow(intervalHours = 8) {
    return this._temporalService.client
      .getRawClient()
      ?.workflow.start('operationsDigestWorkflow', {
        workflowId: OPERATIONS_DIGEST_WORKFLOW_ID,
        args: [{ intervalHours }],
        taskQueue: 'main',
        workflowIdConflictPolicy: 'USE_EXISTING',
      });
  }

  async sendDigests(): Promise<OperationsDigestResult> {
    const profiles = (await this._profiles.model.profile.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        organizationId: true,
        whatsappPhone: true,
      },
    })) as DigestProfile[];

    let dispatched = 0;
    for (const profile of profiles) {
      // Um perfil que falha (ex.: query de problemas estourando) NAO pode
      // impedir o resumo dos outros clientes.
      try {
        if (await this.sendForProfile(profile)) {
          dispatched++;
        }
      } catch (err) {
        this.logger.error(
          `Resumo do perfil ${profile.id} falhou: ${
            (err as Error)?.name || 'Error'
          }: ${(err as Error)?.message || 'sem detalhe'}`
        );
      }
    }

    return { profiles: profiles.length, dispatched };
  }

  private async sendForProfile(profile: DigestProfile): Promise<boolean> {
    // `getProblems` usa apenas `org.id` — nao carregamos a organizacao inteira
    // so para montar o resumo.
    const problems = await this._statusService.getProblems(
      { id: profile.organizationId } as Organization,
      profile.id
    );

    // Silencio quando esta tudo certo: avisar "tudo ok" tres vezes por dia
    // treina quem recebe a ignorar a mensagem — e e justamente a mensagem que
    // nao pode ser ignorada.
    if (problems.summary.total === 0) {
      return false;
    }

    const webhooks = await this._webhooks.getWebhooks(
      profile.organizationId,
      profile.id
    );
    if (!webhooks.length) {
      return false;
    }

    const body = JSON.stringify({
      event: OPERATIONS_DIGEST_EVENT,
      profileId: profile.id,
      profileName: profile.name,
      whatsappPhone: profile.whatsappPhone ?? null,
      summary: problems.summary,
      channels: problems.channels.slice(0, ITEMS_PER_KIND).map((c) => ({
        name: c.name,
        identifier: c.identifier,
        severity: c.severity,
        reason: c.reason ?? null,
      })),
      posts: problems.posts.slice(0, ITEMS_PER_KIND).map((p) => ({
        id: p.id,
        channel: p.channel ? p.channel.name : null,
      })),
      automations: problems.automations.slice(0, ITEMS_PER_KIND).map((a) => ({
        flowId: a.flowId,
        flowName: a.flowName,
        error: a.error ?? null,
      })),
      generatedAt: new Date().toISOString(),
    });

    const results = await Promise.all(
      webhooks.map(async (webhook: any) => {
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

    return results.some(Boolean);
  }
}

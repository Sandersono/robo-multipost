import { continueAsNew, proxyActivities, sleep } from '@temporalio/workflow';
import type { OperationsDigestActivity } from '@gitroom/orchestrator/activities/operations-digest.activity';

const { sendOperationsDigest } = proxyActivities<OperationsDigestActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 2,
    initialInterval: '1 minute',
  },
});

const ONE_HOUR_MS = 60 * 60_000;
// Recicla a history antes de o Temporal forcar a terminacao (~50k eventos). A
// cada 8h, 500 ciclos passam de 5 meses — folgado.
const CYCLES_BEFORE_CONTINUE = 500;
// Backoff quando um ciclo falha (ex.: DB indisponivel logo apos deploy) para
// nao deixar o workflow morrer.
const FAILURE_BACKOFF_MS = 10 * 60_000;

/**
 * Workflow SINGLETON (`operations-digest`) que monta e empurra o resumo
 * operacional de cada perfil pelos webhooks de saida — o destino tipico e um
 * fluxo n8n que manda WhatsApp.
 *
 * Cadencia por INTERVALO, nao por hora do dia: hora de parede dentro de um
 * workflow deterministico exigiria lidar com fuso e horario de verao no replay.
 * O default de 8h da tres avisos por dia, que e a cadencia de quem olha a
 * plataforma 2 ou 3 vezes.
 *
 * Loop resiliente conforme apps/orchestrator/CLAUDE.md pitfall #9: try/catch com
 * backoff no corpo + continueAsNew FORA do try/catch (ele desenrola via throw de
 * controle que um catch engoliria). Reconciliado no boot pelo
 * StartupMigrationService (OperationsDigestService.ensureWorkflow).
 */
export async function operationsDigestWorkflow({
  intervalHours = 8,
}: { intervalHours?: number } = {}) {
  const intervalMs = Math.max(intervalHours, 1) * ONE_HOUR_MS;

  let cycles = 0;
  while (true) {
    cycles++;
    try {
      await sendOperationsDigest();
      await sleep(intervalMs);
    } catch (err) {
      // Loga SOMENTE name+message — nunca o erro cru, que pode arrastar corpo
      // de requisicao. Mesma disciplina do refresh-tokens-cron.
      console.error(
        `[operations-digest] cycle failed, backing off: ${
          (err as Error)?.name || 'Error'
        }: ${(err as Error)?.message || 'sem detalhe'}`
      );
      await sleep(FAILURE_BACKOFF_MS);
    }

    // continueAsNew FICA FORA do try/catch (ver pitfall #9).
    if (cycles >= CYCLES_BEFORE_CONTINUE) {
      return await continueAsNew({ intervalHours });
    }
  }
}

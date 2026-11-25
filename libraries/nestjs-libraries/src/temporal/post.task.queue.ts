/**
 * Quais redes ganham um worker (fila) proprio no Temporal.
 *
 * Cada worker custa memoria no orchestrator, e o padrao e um por rede suportada.
 * `TEMPORAL_WORKER_PROVIDERS` (ex.: "instagram,facebook") limita a lista numa
 * instancia pequena. Vazia ou ausente = todas, como sempre foi.
 *
 * Rede fora da lista continua publicando: as activities dela rodam na fila
 * `main`. Sem esse desvio, o post ficaria parado numa fila sem worker. O custo e
 * perder o limite de concorrencia especifico daquela rede.
 */
export const MAIN_TASK_QUEUE = 'main';

const enabledProviders = (): string[] =>
  (process.env.TEMPORAL_WORKER_PROVIDERS || '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

export const hasOwnWorker = (queue: string): boolean => {
  const enabled = enabledProviders();
  return (
    queue === MAIN_TASK_QUEUE || !enabled.length || enabled.includes(queue)
  );
};

export const postTaskQueue = (providerIdentifier: string): string => {
  if (providerIdentifier.startsWith('zernio-')) {
    return MAIN_TASK_QUEUE;
  }

  const queue = providerIdentifier.split('-')[0].toLowerCase();
  return hasOwnWorker(queue) ? queue : MAIN_TASK_QUEUE;
};

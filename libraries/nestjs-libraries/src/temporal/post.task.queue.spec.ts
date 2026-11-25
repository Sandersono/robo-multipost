import { hasOwnWorker, postTaskQueue } from './post.task.queue';

describe('post.task.queue', () => {
  afterEach(() => {
    delete process.env.TEMPORAL_WORKER_PROVIDERS;
  });

  it('sem a variavel, cada rede usa a propria fila', () => {
    expect(postTaskQueue('reddit')).toBe('reddit');
    expect(postTaskQueue('linkedin-page')).toBe('linkedin');
    expect(postTaskQueue('zernio-tiktok')).toBe('main');
    expect(hasOwnWorker('reddit')).toBe(true);
  });

  it('com a variavel, rede fora da lista cai na fila main', () => {
    process.env.TEMPORAL_WORKER_PROVIDERS = ' Instagram, facebook ,';
    expect(postTaskQueue('instagram')).toBe('instagram');
    expect(postTaskQueue('instagram-standalone')).toBe('instagram');
    expect(postTaskQueue('facebook')).toBe('facebook');
    expect(postTaskQueue('reddit')).toBe('main');
    expect(hasOwnWorker('main')).toBe(true);
    expect(hasOwnWorker('reddit')).toBe(false);
  });
});

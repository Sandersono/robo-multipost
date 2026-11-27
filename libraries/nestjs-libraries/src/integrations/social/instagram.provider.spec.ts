import 'reflect-metadata';
import { InstagramProvider } from './instagram.provider';

describe('InstagramProvider.getMediaMetadata', () => {
  let provider: InstagramProvider;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    provider = new InstagramProvider();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('deve montar URL com host recebido e fields essenciais', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'm-1', permalink: 'p', media_type: 'IMAGE' }),
    });
    global.fetch = fetchMock as any;

    await provider.getMediaMetadata('m-1', 'TOK', 'graph.facebook.com');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://graph.facebook.com/v25.0/m-1?')
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('thumbnail_url');
    expect(url).toContain('boost_eligibility_info'); // graph.facebook.com suporta
    expect(url).toContain('access_token=TOK');
  });

  it('deve marcar isAd=true quando eligible_to_boost=false', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'm-1',
        media_type: 'VIDEO',
        boost_eligibility_info: { eligible_to_boost: false },
      }),
    }) as any;

    const result = await provider.getMediaMetadata(
      'm-1',
      'TOK',
      'graph.facebook.com'
    );

    expect(result.isAd).toBe(true);
  });

  it('deve marcar isAd=false quando eligible_to_boost=true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'm-1',
        media_type: 'VIDEO',
        boost_eligibility_info: { eligible_to_boost: true },
      }),
    }) as any;

    const result = await provider.getMediaMetadata('m-1', 'TOK');

    expect(result.isAd).toBe(false);
  });

  it('deve retornar isAd=undefined quando campo nao vem na resposta', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'm-1', media_type: 'IMAGE' }),
    }) as any;

    const result = await provider.getMediaMetadata('m-1', 'TOK');

    expect(result.isAd).toBeUndefined();
  });

  it('deve fazer fallback de thumbnailUrl pra media_url quando thumbnail_url ausente', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'm-1',
        media_type: 'IMAGE',
        media_url: 'https://cdn/image.jpg',
      }),
    }) as any;

    const result = await provider.getMediaMetadata('m-1', 'TOK');

    expect(result.thumbnailUrl).toBe('https://cdn/image.jpg');
  });

  it('deve preferir thumbnail_url quando ambos vem', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'm-1',
        media_type: 'VIDEO',
        media_url: 'https://cdn/video.mp4',
        thumbnail_url: 'https://cdn/thumb.jpg',
      }),
    }) as any;

    const result = await provider.getMediaMetadata('m-1', 'TOK');

    expect(result.thumbnailUrl).toBe('https://cdn/thumb.jpg');
  });

  it('deve lancar erro quando resposta nao-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'Object does not exist' },
      }),
    }) as any;

    await expect(
      provider.getMediaMetadata('bad-id', 'TOK')
    ).rejects.toThrow(/HTTP 400/);
  });

  it('graph.instagram.com nao deve nem tentar boost_eligibility_info', async () => {
    // Documentacao Meta: o campo so existe em "Instagram API with Facebook Login"
    // (host graph.facebook.com). Em graph.instagram.com nem pedimos.
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'm-1',
        permalink: 'https://...',
        caption: 'ola',
        media_type: 'VIDEO',
        thumbnail_url: 'https://thumb',
      }),
    });
    global.fetch = fetchMock as any;

    const result = await provider.getMediaMetadata(
      'm-1',
      'TOK',
      'graph.instagram.com'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).not.toContain('boost_eligibility_info');
    expect(result.isAd).toBeUndefined();
    expect(result.permalink).toBe('https://...');
  });

  it('graph.facebook.com retry defensive quando app type nao suporta o campo', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message:
              "(#100) Tried accessing nonexisting field (boost_eligibility_info) on node type (Media)",
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'm-1',
          permalink: 'https://...',
          caption: 'ola',
          media_type: 'VIDEO',
          thumbnail_url: 'https://thumb',
        }),
      });
    global.fetch = fetchMock as any;

    const result = await provider.getMediaMetadata(
      'm-1',
      'TOK',
      'graph.facebook.com'
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('boost_eligibility_info');
    expect(fetchMock.mock.calls[1][0]).not.toContain('boost_eligibility_info');
    expect(result.isAd).toBeUndefined();
    expect(result.permalink).toBe('https://...');
  });

  it('nao deve fazer retry quando 400 eh por outro motivo', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'Invalid OAuth access token' },
      }),
    });
    global.fetch = fetchMock as any;

    await expect(
      provider.getMediaMetadata('m-1', 'TOK', 'graph.instagram.com')
    ).rejects.toThrow(/Invalid OAuth/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Smoke test apenas para garantir que pages() nao lanca quando fetch falha
  // (rede caida ou timeout). Garante que o catch global cobre a falha do
  // primeiro fetch para /me/accounts. Cobertura completa do budget de 90s e
  // dos timeouts individuais fica como divida tecnica.
  it('pages() retorna array (mesmo vazio) sem lancar quando fetch falha', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('Network down'));
    global.fetch = fetchMock as any;

    const result = await provider.pages('TOK');
    expect(Array.isArray(result)).toBe(true);
  });

  // Garante que erros do Meta no token exchange virem mensagens explicitas
  // em vez de TypeError obscuro ("Cannot read properties of undefined").
  it('authenticate() lanca mensagem explicita quando token exchange retorna erro', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      json: async () => ({
        error: {
          message: 'Application request limit reached',
          type: 'OAuthException',
          code: 4,
        },
      }),
    });
    global.fetch = fetchMock as any;

    await expect(
      provider.authenticate(
        { code: 'CODE', codeVerifier: 'CV', refresh: '' }
      )
    ).rejects.toThrow(/Meta token exchange failed/);
  });

});


const jsonRes = (body: any, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
});

describe('InstagramProvider - inscricao da Pagina no app', () => {
  let provider: InstagramProvider;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    provider = new InstagramProvider();
    originalFetch = global.fetch;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('deve pedir o escopo pages_manage_metadata', () => {
    expect(provider.scopes).toContain('pages_manage_metadata');
  });

  it('subscribePageToApp deve fazer POST com subscribed_fields=feed', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonRes({ success: true }));
    global.fetch = fetchMock as any;

    const result = await provider.subscribePageToApp('PAGE1', 'PTOKEN');

    expect(result).toEqual({ success: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(
      'https://graph.facebook.com/v25.0/PAGE1/subscribed_apps?subscribed_fields=feed'
    );
    expect(init.method).toBe('POST');
  });

  it('subscribePageToApp deve devolver o erro da Graph API sem lancar', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonRes(
        { error: { message: '(#200) requires pages_manage_metadata', code: 200 } },
        false,
        403
      )
    ) as any;

    const result = await provider.subscribePageToApp('PAGE1', 'PTOKEN');

    expect(result.success).toBe(false);
    expect(result.error).toContain('pages_manage_metadata');
  });

  it('checkPageSubscription deve achar o app pelo id', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonRes({
        data: [
          { id: '999', name: 'outro' },
          { id: '2046', name: 'Conexao', subscribed_fields: ['feed'] },
        ],
      })
    ) as any;

    await expect(
      provider.checkPageSubscription('PAGE1', 'PTOKEN', '2046')
    ).resolves.toEqual({ subscribed: true, fields: ['feed'] });
  });

  it('checkPageSubscription deve dizer nao inscrito quando o app nao esta na lista', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonRes({ data: [] })) as any;

    const result = await provider.checkPageSubscription('PAGE1', 'PTOKEN', '2046');
    expect(result.subscribed).toBe(false);
  });

  it('checkPageSubscription deve devolver subscribed=null quando a leitura falha', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonRes({ error: { message: 'requires pages_manage_metadata', code: 200 } }, false, 403)
    ) as any;

    const result = await provider.checkPageSubscription('PAGE1', 'PTOKEN', '2046');
    expect(result.subscribed).toBeNull();
    expect(result.error).toContain('pages_manage_metadata');
  });

  it('fetchPageInformation deve inscrever a Pagina com o token da Pagina', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'PAGE_TOKEN', name: 'Pag' }))
      .mockResolvedValueOnce(
        jsonRes({ id: 'IG1', name: 'ig', username: 'ig', profile_picture_url: 'p' })
      )
      .mockResolvedValueOnce(jsonRes({ success: true }));
    global.fetch = fetchMock as any;

    const info = await provider.fetchPageInformation('USER_TOKEN', {
      pageId: 'PAGE1',
      id: 'IG1',
    });

    expect(info.access_token).toBe('PAGE_TOKEN');
    const [url, init] = fetchMock.mock.calls[2];
    expect(url).toContain('/PAGE1/subscribed_apps?subscribed_fields=feed');
    expect(url).toContain('access_token=PAGE_TOKEN');
    expect(init.method).toBe('POST');
  });

  it('fetchPageInformation nao deve falhar quando a inscricao falha', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'PAGE_TOKEN' }))
      .mockResolvedValueOnce(jsonRes({ id: 'IG1', name: 'ig' }))
      .mockRejectedValueOnce(new Error('network')) as any;

    await expect(
      provider.fetchPageInformation('USER_TOKEN', { pageId: 'PAGE1', id: 'IG1' })
    ).resolves.toMatchObject({ id: 'IG1', access_token: 'PAGE_TOKEN' });
  });

  it('sendPrivateReply deve levar code/subcode e a dica no erro', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(jsonRes({ id: 'PAGE1' }))
      .mockResolvedValueOnce(
        jsonRes(
          {
            error: {
              message:
                '(#200) O dono da conta desativou o acesso às mensagens diretas do Instagram',
              code: 200,
              error_subcode: 2534041,
            },
          },
          false,
          400
        )
      ) as any;

    await expect(
      provider.sendPrivateReply('PTOKEN', 'IG1', 'C1', 'oi')
    ).rejects.toThrow(/desativou o acesso.*subcode=2534041.*Permitir acesso a mensagens/);
  });
});

import {
  formatGraphApiError,
  IG_MESSAGING_DISABLED_HINT,
} from './graph-error.message';

describe('formatGraphApiError', () => {
  it('deve incluir mensagem, code e subcode da Graph API', () => {
    const out = formatGraphApiError('Instagram private reply failed', 400, {
      error: { message: '(#100) Invalid parameter', code: 100, error_subcode: 33 },
    });
    expect(out).toBe(
      'Instagram private reply failed (400): (#100) Invalid parameter [code=100 subcode=33]'
    );
  });

  it('deve acrescentar a dica de mensagens quando o subcode for 2534041', () => {
    const out = formatGraphApiError('Instagram private reply failed', 400, {
      error: {
        message:
          '(#200) O dono da conta desativou o acesso às mensagens diretas do Instagram',
        code: 200,
        error_subcode: 2534041,
      },
    });
    expect(out).toContain('O dono da conta desativou o acesso');
    expect(out).toContain('subcode=2534041');
    expect(out).toContain(IG_MESSAGING_DISABLED_HINT);
  });

  it('deve serializar o corpo quando nao houver objeto error', () => {
    expect(formatGraphApiError('x', 500, { foo: 1 })).toBe('x (500): {"foo":1}');
  });
});

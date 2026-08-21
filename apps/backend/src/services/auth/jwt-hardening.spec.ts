import { sign } from 'jsonwebtoken';
import { AuthService } from '@gitroom/helpers/auth/auth.service';

// Achado B9 da auditoria (SECURITY_AUDIT.md): verify() sem fixar `algorithms`.
//
// O spec mora aqui, e nao ao lado do helper, porque libraries/helpers nao tem
// projeto jest configurado (jest.config.ts cobre so apps/backend e
// nestjs-libraries) — um spec la nunca rodaria. Dar um projeto jest ao pacote
// helpers e melhoria separada.
describe('AuthService.verifyJWT — algoritmo fixado (B9)', () => {
  const ORIGINAL = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo-de-teste-para-jwt-hardening';
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL;
  });

  it('aceita token HS256, que e o algoritmo que signJWT emite', () => {
    const token = AuthService.signJWT({ id: 'user-1' });

    const payload = AuthService.verifyJWT(token) as { id: string };

    expect(payload.id).toBe('user-1');
  });

  // Sem o pin, o jsonwebtoken aceita qualquer algoritmo HMAC que valide com o
  // mesmo segredo. Fixar HS256 fecha a familia inteira de alg-confusion.
  it('rejeita token assinado com outro algoritmo HMAC (HS512)', () => {
    const token = sign({ id: 'atacante' }, process.env.JWT_SECRET!, {
      algorithm: 'HS512',
    });

    expect(() => AuthService.verifyJWT(token)).toThrow();
  });

  it('rejeita token com assinatura invalida', () => {
    const token = sign({ id: 'atacante' }, 'outro-segredo');

    expect(() => AuthService.verifyJWT(token)).toThrow();
  });
});

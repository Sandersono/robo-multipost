import { HttpException } from '@nestjs/common';
import { ProfileService } from './profile.service';

const makeRepo = () => ({
  getProfileById: jest.fn(),
  getProfileByApiKey: jest.fn(),
  updateApiKey: jest.fn(),
  getMembers: jest.fn(),
  addMember: jest.fn(),
  removeMember: jest.fn(),
  getProfilesByOrgId: jest.fn(),
  getUserProfileIds: jest.fn(),
  getMemberRole: jest.fn(),
  isUserInOrg: jest.fn(),
});

describe('ProfileService', () => {
  let service: ProfileService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new ProfileService(repo as any);
  });

  describe('getProfileByApiKey', () => {
    it('delega ao repositorio sem transformacao', async () => {
      const fakeProfile = { id: 'prof-1', apiKey: 'key-abc', organization: {} };
      repo.getProfileByApiKey.mockResolvedValue(fakeProfile);

      const result = await service.getProfileByApiKey('key-abc');

      expect(result).toEqual(fakeProfile);
      expect(repo.getProfileByApiKey).toHaveBeenCalledWith('key-abc');
    });

    it('retorna null quando chave nao existe', async () => {
      repo.getProfileByApiKey.mockResolvedValue(null);

      const result = await service.getProfileByApiKey('inexistente');

      expect(result).toBeNull();
    });
  });

  describe('updateApiKey', () => {
    it('lanca 404 quando perfil nao encontrado', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(service.updateApiKey('org-1', 'prof-1')).rejects.toBeInstanceOf(HttpException);
      expect(repo.updateApiKey).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil encontrado', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.updateApiKey.mockResolvedValue({ id: 'prof-1', apiKey: 'new-key' });

      const result = await service.updateApiKey('org-1', 'prof-1');

      expect(result).toEqual({ id: 'prof-1', apiKey: 'new-key' });
      expect(repo.updateApiKey).toHaveBeenCalledWith('org-1', 'prof-1');
    });
  });

  describe('getMembers', () => {
    it('lanca 404 quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(service.getMembers('org-1', 'prof-de-outra-org')).rejects.toBeInstanceOf(
        HttpException
      );
      expect(repo.getMembers).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMembers.mockResolvedValue([{ userId: 'u-1' }]);

      const result = await service.getMembers('org-1', 'prof-1');

      expect(result).toEqual([{ userId: 'u-1' }]);
      expect(repo.getProfileById).toHaveBeenCalledWith('org-1', 'prof-1');
      expect(repo.getMembers).toHaveBeenCalledWith('prof-1');
    });
  });

  describe('addMember', () => {
    beforeEach(() => {
      repo.isUserInOrg.mockResolvedValue({ id: 'uo-1' });
    });

    it('lanca 404 quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(
        service.addMember('org-1', 'prof-de-outra-org', 'u-1', 'EDITOR')
      ).rejects.toBeInstanceOf(HttpException);
      expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.addMember.mockResolvedValue({ id: 'm-1' });

      await service.addMember('org-1', 'prof-1', 'u-1', 'EDITOR');

      expect(repo.getProfileById).toHaveBeenCalledWith('org-1', 'prof-1');
      expect(repo.addMember).toHaveBeenCalledWith('prof-1', 'u-1', 'EDITOR');
    });

    it('lanca 400 quando usuario adicionado nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.isUserInOrg.mockResolvedValue(null);

      await expect(
        service.addMember('org-1', 'prof-1', 'u-de-outra-org', 'EDITOR')
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('bloqueia MANAGER concedendo papel acima do proprio', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      // ator MANAGER; alvo ainda sem membership
      repo.getMemberRole
        .mockResolvedValueOnce({ role: 'MANAGER' })
        .mockResolvedValueOnce(null);

      await expect(
        service.addMember('org-1', 'prof-1', 'u-1', 'OWNER', {
          userId: 'actor-1',
          orgRole: 'USER',
        })
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('permite MANAGER concedendo papel igual ou abaixo do proprio', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      // ator MANAGER; alvo ainda sem membership
      repo.getMemberRole
        .mockResolvedValueOnce({ role: 'MANAGER' })
        .mockResolvedValueOnce(null);
      repo.addMember.mockResolvedValue({ id: 'm-1' });

      await service.addMember('org-1', 'prof-1', 'u-1', 'EDITOR', {
        userId: 'actor-1',
        orgRole: 'USER',
      });

      expect(repo.addMember).toHaveBeenCalledWith('prof-1', 'u-1', 'EDITOR');
    });

    it('bloqueia MANAGER rebaixando um OWNER existente', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      // ator MANAGER; alvo ja e OWNER (upsert rebaixaria)
      repo.getMemberRole
        .mockResolvedValueOnce({ role: 'MANAGER' })
        .mockResolvedValueOnce({ role: 'OWNER' });

      await expect(
        service.addMember('org-1', 'prof-1', 'u-owner', 'EDITOR', {
          userId: 'actor-1',
          orgRole: 'USER',
        })
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.addMember).not.toHaveBeenCalled();
    });

    it('nao aplica hierarquia quando ator e admin da org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.addMember.mockResolvedValue({ id: 'm-1' });

      await service.addMember('org-1', 'prof-1', 'u-1', 'OWNER', {
        userId: 'actor-1',
        orgRole: 'ADMIN',
      });

      expect(repo.getMemberRole).not.toHaveBeenCalled();
      expect(repo.addMember).toHaveBeenCalledWith('prof-1', 'u-1', 'OWNER');
    });

    it('rejeita role fora do enum com 400 (fail-closed)', async () => {
      await expect(
        service.addMember('org-1', 'prof-1', 'u-1', 'SUPER_HACK' as any, {
          userId: 'actor-1',
          orgRole: 'USER',
        })
      ).rejects.toMatchObject({ status: 400 });
      expect(repo.addMember).not.toHaveBeenCalled();
    });
  });

  describe('getUserProfileMemberships', () => {
    it('retorna as memberships com profileId e role', async () => {
      repo.getUserProfileIds.mockResolvedValue([
        { profileId: 'prof-1', role: 'EDITOR' },
        { profileId: 'prof-2', role: 'VIEWER' },
      ]);

      const result = await service.getUserProfileMemberships('u-1', 'org-1');

      expect(result).toEqual([
        { profileId: 'prof-1', role: 'EDITOR' },
        { profileId: 'prof-2', role: 'VIEWER' },
      ]);
      expect(repo.getUserProfileIds).toHaveBeenCalledWith('u-1', 'org-1');
    });
  });

  describe('getUserProfileIds', () => {
    it('mapeia as memberships para uma lista de ids', async () => {
      repo.getUserProfileIds.mockResolvedValue([
        { profileId: 'prof-1', role: 'EDITOR' },
        { profileId: 'prof-2', role: 'VIEWER' },
      ]);

      const result = await service.getUserProfileIds('u-1', 'org-1');

      expect(result).toEqual(['prof-1', 'prof-2']);
    });
  });

  describe('getAccessibleProfiles', () => {
    const profiles = [
      { id: 'prof-default', isDefault: true },
      { id: 'prof-client-1', isDefault: false },
      { id: 'prof-client-2', isDefault: false },
    ];

    it('retorna todos os perfis da org quando role e ADMIN', async () => {
      repo.getProfilesByOrgId.mockResolvedValue(profiles);

      const result = await service.getAccessibleProfiles('org-1', 'u-1', 'ADMIN');

      expect(result).toEqual(profiles);
      expect(repo.getUserProfileIds).not.toHaveBeenCalled();
    });

    it('retorna todos os perfis da org quando role e SUPERADMIN', async () => {
      repo.getProfilesByOrgId.mockResolvedValue(profiles);

      const result = await service.getAccessibleProfiles('org-1', 'u-1', 'SUPERADMIN');

      expect(result).toEqual(profiles);
      expect(repo.getUserProfileIds).not.toHaveBeenCalled();
    });

    it('filtra por membership quando role e USER', async () => {
      repo.getProfilesByOrgId.mockResolvedValue(profiles);
      repo.getUserProfileIds.mockResolvedValue([
        { profileId: 'prof-client-1', role: 'EDITOR' },
      ]);

      const result = await service.getAccessibleProfiles('org-1', 'u-1', 'USER');

      expect(result).toEqual([{ id: 'prof-client-1', isDefault: false }]);
      expect(repo.getUserProfileIds).toHaveBeenCalledWith('u-1', 'org-1');
    });

    it('retorna lista vazia quando USER sem memberships', async () => {
      repo.getProfilesByOrgId.mockResolvedValue(profiles);
      repo.getUserProfileIds.mockResolvedValue([]);

      const result = await service.getAccessibleProfiles('org-1', 'u-1', 'USER');

      expect(result).toEqual([]);
    });
  });

  describe('getEffectiveProfileRole', () => {
    it('retorna OWNER implicito para ADMIN quando perfil pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });

      const result = await service.getEffectiveProfileRole('org-1', 'prof-1', 'u-1', 'ADMIN');

      expect(result).toBe('OWNER');
      expect(repo.getMemberRole).not.toHaveBeenCalled();
    });

    it('retorna null quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      const result = await service.getEffectiveProfileRole('org-1', 'prof-x', 'u-1', 'ADMIN');

      expect(result).toBeNull();
    });

    it('retorna o role da membership para USER', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMemberRole.mockResolvedValue({ role: 'MANAGER' });

      const result = await service.getEffectiveProfileRole('org-1', 'prof-1', 'u-1', 'USER');

      expect(result).toBe('MANAGER');
      expect(repo.getMemberRole).toHaveBeenCalledWith('prof-1', 'u-1');
    });

    it('retorna null para USER sem membership no perfil', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMemberRole.mockResolvedValue(null);

      const result = await service.getEffectiveProfileRole('org-1', 'prof-1', 'u-1', 'USER');

      expect(result).toBeNull();
    });
  });

  describe('assertProfileAccess', () => {
    it('lanca 404 quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(
        service.assertProfileAccess('org-1', 'prof-x', 'u-1', 'ADMIN')
      ).rejects.toMatchObject({ status: 404 });
    });

    it('retorna perfil com role OWNER implicito para ADMIN', async () => {
      const profile = { id: 'prof-1', organizationId: 'org-1' };
      repo.getProfileById.mockResolvedValue(profile);

      const result = await service.assertProfileAccess('org-1', 'prof-1', 'u-1', 'ADMIN');

      expect(result).toEqual({ profile, role: 'OWNER' });
      expect(repo.getMemberRole).not.toHaveBeenCalled();
    });

    it('lanca 403 quando USER nao e membro do perfil', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMemberRole.mockResolvedValue(null);

      await expect(
        service.assertProfileAccess('org-1', 'prof-1', 'u-1', 'USER')
      ).rejects.toMatchObject({ status: 403 });
    });

    it('retorna perfil e role da membership para USER membro', async () => {
      const profile = { id: 'prof-1', organizationId: 'org-1' };
      repo.getProfileById.mockResolvedValue(profile);
      repo.getMemberRole.mockResolvedValue({ role: 'VIEWER' });

      const result = await service.assertProfileAccess('org-1', 'prof-1', 'u-1', 'USER');

      expect(result).toEqual({ profile, role: 'VIEWER' });
    });
  });

  describe('removeMember', () => {
    it('lanca 404 quando perfil nao pertence a org', async () => {
      repo.getProfileById.mockResolvedValue(null);

      await expect(
        service.removeMember('org-1', 'prof-de-outra-org', 'u-1')
      ).rejects.toBeInstanceOf(HttpException);
      expect(repo.removeMember).not.toHaveBeenCalled();
    });

    it('delega ao repositorio quando perfil pertence a org', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.removeMember.mockResolvedValue({ id: 'm-1' });

      await service.removeMember('org-1', 'prof-1', 'u-1');

      expect(repo.getProfileById).toHaveBeenCalledWith('org-1', 'prof-1');
      expect(repo.removeMember).toHaveBeenCalledWith('prof-1', 'u-1');
    });

    it('bloqueia MANAGER removendo membro com papel acima do proprio', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      // Promise.all: 1a consulta = ator (MANAGER); 2a = alvo (OWNER)
      repo.getMemberRole
        .mockResolvedValueOnce({ role: 'MANAGER' })
        .mockResolvedValueOnce({ role: 'OWNER' });

      await expect(
        service.removeMember('org-1', 'prof-1', 'u-owner', {
          userId: 'actor-1',
          orgRole: 'USER',
        })
      ).rejects.toMatchObject({ status: 403 });
      expect(repo.removeMember).not.toHaveBeenCalled();
    });

    it('permite MANAGER removendo membro EDITOR', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      // Promise.all: 1a consulta = ator (MANAGER); 2a = alvo (EDITOR)
      repo.getMemberRole
        .mockResolvedValueOnce({ role: 'MANAGER' })
        .mockResolvedValueOnce({ role: 'EDITOR' });
      repo.removeMember.mockResolvedValue({ id: 'm-1' });

      await service.removeMember('org-1', 'prof-1', 'u-editor', {
        userId: 'actor-1',
        orgRole: 'USER',
      });

      expect(repo.removeMember).toHaveBeenCalledWith('prof-1', 'u-editor');
    });
  });

  describe('assertCanGrantProfileRole', () => {
    it('admin da org concede qualquer papel sem checar membership', async () => {
      await service.assertCanGrantProfileRole(
        'org-1',
        'prof-1',
        { userId: 'admin-1', orgRole: 'ADMIN' },
        'OWNER'
      );
      expect(repo.getMemberRole).not.toHaveBeenCalled();
    });

    it('Dono (OWNER) concede MANAGER', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMemberRole.mockResolvedValue({ role: 'OWNER' });

      await service.assertCanGrantProfileRole(
        'org-1',
        'prof-1',
        { userId: 'owner-1', orgRole: 'USER' },
        'MANAGER'
      );
    });

    it('Gerente (MANAGER) nao concede OWNER (escalonamento -> 403)', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMemberRole.mockResolvedValue({ role: 'MANAGER' });

      await expect(
        service.assertCanGrantProfileRole(
          'org-1',
          'prof-1',
          { userId: 'manager-1', orgRole: 'USER' },
          'OWNER'
        )
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('Gerente concede EDITOR', async () => {
      repo.getProfileById.mockResolvedValue({ id: 'prof-1', organizationId: 'org-1' });
      repo.getMemberRole.mockResolvedValue({ role: 'MANAGER' });

      await service.assertCanGrantProfileRole(
        'org-1',
        'prof-1',
        { userId: 'manager-1', orgRole: 'USER' },
        'EDITOR'
      );
    });

    it('rejeita papel invalido com 400', async () => {
      await expect(
        service.assertCanGrantProfileRole(
          'org-1',
          'prof-1',
          { userId: 'admin-1', orgRole: 'ADMIN' },
          'SUPERBOSS' as any
        )
      ).rejects.toBeInstanceOf(HttpException);
    });
  });
});

// O endpoint de atualizar perfil recebe o corpo com tipo inline, sem DTO
// validando, e o telefone vai parar no payload do webhook de aprovacao
// (n8n -> WhatsApp). A normalizacao mora aqui.
describe('ProfileService.updateProfile — telefone do cliente', () => {
  const build = () => {
    const repo = { updateProfile: jest.fn().mockResolvedValue({}) } as any;
    return { repo, service: new ProfileService(repo) };
  };

  const dataSent = (repo: any) => repo.updateProfile.mock.calls[0][2];

  it('guarda so os digitos, descartando mascara', async () => {
    const { repo, service } = build();

    await service.updateProfile('org-1', 'prof-1', {
      whatsappPhone: '+55 (11) 99999-8888',
    });

    expect(dataSent(repo).whatsappPhone).toBe('5511999998888');
  });

  it('campo vazio limpa o telefone (null), nao grava string vazia', async () => {
    const { repo, service } = build();

    await service.updateProfile('org-1', 'prof-1', { whatsappPhone: '' });

    expect(dataSent(repo).whatsappPhone).toBeNull();
  });

  it('texto sem digito nenhum tambem limpa', async () => {
    const { repo, service } = build();

    await service.updateProfile('org-1', 'prof-1', { whatsappPhone: 'abc' });

    expect(dataSent(repo).whatsappPhone).toBeNull();
  });

  it('trunca em 15 digitos (maior E.164 possivel)', async () => {
    const { repo, service } = build();

    await service.updateProfile('org-1', 'prof-1', {
      whatsappPhone: '1'.repeat(40),
    });

    expect(dataSent(repo).whatsappPhone).toHaveLength(15);
  });

  it('nao mexe no telefone quando o campo nao vem no corpo', async () => {
    const { repo, service } = build();

    await service.updateProfile('org-1', 'prof-1', { name: 'Cliente A' });

    expect(dataSent(repo).whatsappPhone).toBeUndefined();
  });
});

// Vazamento de credencial no GET /profiles.
//
// getProfilesByOrgId usa `include`, que traz TODOS os campos escalares —
// inclusive apiKey, lateApiKey e zernioApiKey. getAccessibleProfiles filtrava
// apenas LINHAS (quais perfis o usuario ve), nunca CAMPOS, e o controller
// devolve o retorno cru.
//
// Impacto: escalonamento de privilegio, nao so exposicao. Um cliente convidado
// como VISUALIZADOR e somente-leitura na interface, mas Profile.apiKey da acesso
// a /public/v1/*, que cria e exclui post. lateApiKey/zernioApiKey sao da conta
// paga da agencia.
//
// A limpeza fica AQUI e nao no select do repositorio de proposito:
// public.profiles.controller le p.apiKey para calcular `hasApiKey: !!p.apiKey`
// (booleano, seguro). Tirar o campo do select faria esse booleano virar sempre
// false — regressao silenciosa.
describe('ProfileService.getAccessibleProfiles — nao vaza credenciais', () => {
  const SECRETS = ['apiKey', 'lateApiKey', 'zernioApiKey'];

  const profileWithSecrets = (id: string, extra: any = {}) => ({
    id,
    name: 'Cliente ' + id,
    slug: id,
    isDefault: false,
    whatsappPhone: '5511999998888',
    apiKey: 'pk_secreta',
    lateApiKey: 'late_secreta',
    zernioApiKey: 'zernio_secreta',
    ...extra,
  });

  const build = (profiles: any[], memberships: any[] = []) => {
    const repo = {
      getProfilesByOrgId: jest.fn().mockResolvedValue(profiles),
      getUserProfileIds: jest.fn().mockResolvedValue(memberships),
    } as any;
    return new ProfileService(repo);
  };

  it.each(SECRETS)('remove %s para admin da org', async (field) => {
    const service = build([profileWithSecrets('p1')]);

    const out = await service.getAccessibleProfiles('org-1', 'u1', 'ADMIN' as any);

    expect((out[0] as any)[field]).toBeUndefined();
  });

  it.each(SECRETS)('remove %s para membro comum', async (field) => {
    const service = build(
      [profileWithSecrets('p1')],
      [{ profileId: 'p1' }]
    );

    const out = await service.getAccessibleProfiles('org-1', 'u1', 'USER' as any);

    expect((out[0] as any)[field]).toBeUndefined();
  });

  it('preserva o que a tela consome', async () => {
    const service = build([profileWithSecrets('p1')]);

    const out = await service.getAccessibleProfiles('org-1', 'u1', 'ADMIN' as any);

    expect(out[0].id).toBe('p1');
    expect(out[0].name).toBe('Cliente p1');
    expect(out[0].whatsappPhone).toBe('5511999998888');
  });

  it('continua filtrando linhas: membro nao ve perfil de outro cliente', async () => {
    const service = build(
      [profileWithSecrets('p1'), profileWithSecrets('p2')],
      [{ profileId: 'p1' }]
    );

    const out = await service.getAccessibleProfiles('org-1', 'u1', 'USER' as any);

    expect(out.map((p: any) => p.id)).toEqual(['p1']);
  });
});

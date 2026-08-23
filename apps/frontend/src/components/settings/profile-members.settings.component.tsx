'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { Button } from '@gitroom/react/form/button';
import { useCurrentProfile } from '@gitroom/frontend/hooks/use-current-profile.hook';
import { useProfilePermissions } from '@gitroom/frontend/hooks/use-profile-permissions';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import copy from 'copy-to-clipboard';

type ProfileRole = 'OWNER' | 'MANAGER' | 'EDITOR' | 'VIEWER';

type Member = {
  id: string;
  userId: string;
  role: ProfileRole;
  user: { id: string; email: string; name: string | null };
};

const RANK: Record<ProfileRole, number> = {
  OWNER: 4,
  MANAGER: 3,
  EDITOR: 2,
  VIEWER: 1,
};

// Gerenciamento de membros DO PERFIL ATIVO (Dono/Gerente ou admin). Convida por
// e-mail com papel <= o proprio (o backend re-valida a hierarquia).
export const ProfileMembersSettingsSection: FC = () => {
  const fetch = useFetch();
  const t = useT();
  const toast = useToaster();
  const { profile } = useCurrentProfile();
  const { role: myRole } = useProfilePermissions();
  const profileId = profile?.id ?? null;
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProfileRole>('EDITOR');
  const [loading, setLoading] = useState(false);
  // Entrega do convite: por e-mail (padrao) ou link copiado. Nao muda
  // quem e o convidado — o e-mail segue obrigatorio nos dois modos.
  const [sendEmail, setSendEmail] = useState(true);

  const roleLabel = useCallback(
    (role: ProfileRole) =>
      ({
        OWNER: t('profile_role_owner', 'Proprietário'),
        MANAGER: t('profile_role_manager', 'Gerente'),
        EDITOR: t('profile_role_editor', 'Editor'),
        VIEWER: t('profile_role_viewer', 'Visualizador'),
      }[role] ?? role),
    [t]
  );

  // So oferece papeis <= o proprio (admin/Dono => todos).
  const myRank = myRole ? RANK[myRole as ProfileRole] ?? 4 : 4;
  const grantableRoles = useMemo(
    () => (Object.keys(RANK) as ProfileRole[]).filter((r) => RANK[r] <= myRank),
    [myRank]
  );

  const load = useCallback(async () => {
    if (!profileId) return [] as Member[];
    return (await (await fetch(`/profiles/${profileId}/members`)).json()) as Member[];
  }, [profileId]);
  const { data, mutate } = useSWR(
    profileId ? `profile-members-${profileId}` : null,
    load,
    { revalidateOnFocus: false }
  );

  // O e-mail e SEMPRE exigido, mesmo quando o link e copiado em vez de
  // enviado: e ele que fica no token e trava o registro (email-lock). Convite
  // por link SEM e-mail e recusado quando DISABLE_REGISTRATION=true — veja
  // AuthService.inviteAllowsRegistration, que nega o bypass sem email casando.
  // O checkbox decide apenas a ENTREGA, nunca a identidade do convidado.
  const invite = useCallback(async () => {
    if (!profileId || !email.trim()) {
      return;
    }
    setLoading(true);
    const res = await fetch(`/profiles/${profileId}/members/invite`, {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim(),
        profileRole: inviteRole,
        sendEmail,
      }),
    });
    setLoading(false);
    if (res.status >= 400) {
      toast.show(t('profile_member_invite_failed', 'Não foi possível convidar'), 'warning');
      return;
    }

    if (!sendEmail) {
      const { url } = await res.json();
      copy(url);
      setEmail('');
      toast.show(
        t('link_copied_to_clipboard', 'Link copiado para a área de transferência'),
        'success'
      );
      await mutate();
      return;
    }

    setEmail('');
    toast.show(t('profile_member_invited', 'Convite enviado'), 'success');
    await mutate();
  }, [profileId, email, inviteRole, sendEmail, mutate, t, toast]);

  const remove = useCallback(
    (m: Member) => async () => {
      if (
        !(await deleteDialog(
          t('profile_member_remove_confirm', 'Remover este membro do perfil?')
        ))
      ) {
        return;
      }
      await fetch(`/profiles/${profileId}/members/${m.userId}`, {
        method: 'DELETE',
      });
      await mutate();
    },
    [profileId, mutate, t]
  );

  if (!profileId) {
    return null;
  }

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">
        {t('profile_members_title', 'Membros do perfil')}
      </h3>
      <div className="text-customColor18 mt-[4px]">
        {t(
          'profile_members_desc',
          'Convide e gerencie quem tem acesso a este perfil.'
        )}
      </div>

      <div className="my-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[24px]">
        <div className="flex flex-col sm:flex-row gap-[8px]">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('email_address', 'E-mail')}
            className="flex-1 h-[40px] px-[12px] bg-newColColor border border-fifth rounded-[4px] text-[14px] outline-none"
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as ProfileRole)}
            className="h-[40px] px-[12px] bg-newColColor border border-fifth rounded-[4px] text-[14px] outline-none"
          >
            {grantableRoles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          <Button loading={loading} onClick={invite}>
            {sendEmail
              ? t('invite', 'Convidar')
              : t('generate_invite_link', 'Gerar link')}
          </Button>
        </div>

        <label className="flex items-center gap-[8px] text-[13px] cursor-pointer -mt-[12px]">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
          />
          <span>
            {t('invite_send_by_email', 'Enviar convite por e-mail')}
          </span>
          <span className="text-customColor18">
            {t(
              'invite_link_hint',
              '— desmarque para copiar o link e enviar você mesmo'
            )}
          </span>
        </label>

        <div className="flex flex-col gap-[12px]">
          {(data || []).map((m) => (
            <div key={m.id} className="flex items-center">
              <div className="flex-1">
                {m.user.name || m.user.email.split('@')[0]}
              </div>
              <div className="flex-1 text-customColor18">
                {roleLabel(m.role)}
              </div>
              <div className="flex-1 flex justify-end">
                {RANK[m.role] <= myRank && (
                  <Button
                    className="!bg-customColor3 !h-[24px] border border-customColor21 rounded-[4px] text-[12px]"
                    onClick={remove(m)}
                    secondary={true}
                  >
                    {t('remove', 'Remover')}
                  </Button>
                )}
              </div>
            </div>
          ))}
          {!(data || []).length && (
            <div className="text-[13px] text-customColor18">
              {t('profile_members_empty', 'Nenhum membro neste perfil ainda.')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SignatureDto } from '@gitroom/nestjs-libraries/dtos/signature/signature.dto';

@Injectable()
export class SignatureRepository {
  constructor(private _signatures: PrismaRepository<'signatures'>) {}

  getSignaturesByOrgId(orgId: string, profileId?: string) {
    return this._signatures.model.signatures.findMany({
      where: { organizationId: orgId, deletedAt: null, ...(profileId ? { profileId } : {}) },
    });
  }

  getDefaultSignature(orgId: string, profileId?: string) {
    return this._signatures.model.signatures.findFirst({
      where: { organizationId: orgId, autoAdd: true, deletedAt: null, ...(profileId ? { profileId } : {}) },
    });
  }

  async createOrUpdateSignature(
    orgId: string,
    signature: SignatureDto,
    id?: string,
    profileId?: string
  ) {
    const values = {
      organizationId: orgId,
      content: signature.content,
      autoAdd: signature.autoAdd,
      ...(profileId ? { profileId } : {}),
    };

    const { id: updatedId, profileId: updatedProfileId } =
      await this._signatures.model.signatures.upsert({
        where: {
          id: id || uuidv4(),
          organizationId: orgId,
          // PUT /signatures/:id passa o id da rota, e o ramo `update` grava o
          // profileId ativo. Sem o perfil aqui, quem conhecesse o id da
          // assinatura do vizinho a reescrevia e a trazia para si.
          ...(profileId ? { profileId } : {}),
        },
        update: values,
        create: values,
      });

    if (values.autoAdd) {
      await this._signatures.model.signatures.updateMany({
        where: {
          organizationId: orgId,
          id: { not: updatedId },
          // "Padrao" e por PERFIL. Sem este filtro, um cliente marcando a
          // propria assinatura como padrao desmarcava a de TODOS os outros
          // perfis da organizacao — no fluxo normal da tela, sem ataque nenhum.
          profileId: updatedProfileId ?? null,
        },
        data: { autoAdd: false },
      });
    }

    return { id: updatedId };
  }

  deleteSignature(orgId: string, id: string, profileId?: string) {
    return this._signatures.model.signatures.update({
      where: { id, organizationId: orgId, ...(profileId ? { profileId } : {}) },
      data: { deletedAt: new Date() },
    });
  }
}

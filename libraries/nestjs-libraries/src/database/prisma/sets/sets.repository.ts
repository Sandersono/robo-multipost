import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SetsDto } from '@gitroom/nestjs-libraries/dtos/sets/sets.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SetsRepository {
  constructor(private _sets: PrismaRepository<'sets'>) {}

  getTotal(orgId: string, profileId?: string) {
    return this._sets.model.sets.count({
      where: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
    });
  }

  getSets(orgId: string, profileId?: string) {
    return this._sets.model.sets.findMany({
      where: {
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  deleteSet(orgId: string, id: string, profileId?: string) {
    return this._sets.model.sets.delete({
      where: {
        id,
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
      },
    });
  }

  async createSet(orgId: string, body: SetsDto, profileId?: string) {
    const { id } = await this._sets.model.sets.upsert({
      where: {
        id: body.id || uuidv4(),
        organizationId: orgId,
        // `body.id` vem do usuario. Sem o perfil aqui, quem conhecesse o id do
        // set do perfil vizinho reescrevia nome e conteudo dele. Fora do
        // perfil, o upsert cai no `create`.
        ...(profileId ? { profileId } : {}),
      },
      create: {
        id: body.id || uuidv4(),
        organizationId: orgId,
        ...(profileId ? { profileId } : {}),
        name: body.name,
        content: body.content,
      },
      update: {
        name: body.name,
        content: body.content,
      },
    });

    return { id };
  }
}

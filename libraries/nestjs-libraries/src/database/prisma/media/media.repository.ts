import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { SaveMediaInformationDto } from '@gitroom/nestjs-libraries/dtos/media/save.media.information.dto';

@Injectable()
export class MediaRepository {
  constructor(
    private _media: PrismaRepository<'media'>,
    private _profiles: PrismaRepository<'profile'>
  ) {}

  async saveFile(
    org: string,
    fileName: string,
    filePath: string,
    originalName?: string,
    profileId?: string
  ) {
    // Mesma regra dos canais: midia nunca nasce sem perfil. Um profileId nulo
    // era exibido em TODOS os perfis, entao um upload feito sem perfil ativo
    // (chave de API de organizacao) vazava para a biblioteca de cada cliente.
    const resolvedProfileId =
      profileId ??
      (
        await this._profiles.model.profile.findFirst({
          where: { organizationId: org, isDefault: true, deletedAt: null },
          select: { id: true },
        })
      )?.id;

    return this._media.model.media.create({
      data: {
        organization: {
          connect: {
            id: org,
          },
        },
        ...(resolvedProfileId
          ? { profile: { connect: { id: resolvedProfileId } } }
          : {}),
        name: fileName,
        path: filePath,
        originalName: originalName || null,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
      },
    });
  }

  getMediaById(id: string) {
    return this._media.model.media.findUnique({
      where: {
        id,
      },
    });
  }

  deleteMedia(org: string, id: string, profileId?: string) {
    return this._media.model.media.update({
      where: {
        id,
        organizationId: org,
        ...(profileId ? { profileId } : {}),
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  saveMediaInformation(org: string, data: SaveMediaInformationDto) {
    return this._media.model.media.update({
      where: {
        id: data.id,
        organizationId: org,
      },
      data: {
        alt: data.alt,
        thumbnail: data.thumbnail,
        thumbnailTimestamp: data.thumbnailTimestamp,
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        alt: true,
        thumbnail: true,
        path: true,
        thumbnailTimestamp: true,
      },
    });
  }

  async getMedia(org: string, page: number, profileId?: string) {
    const pageNum = (page || 1) - 1;
    // Estrito por perfil: midia de um cliente nunca aparece na biblioteca de outro.
    const profileFilter = profileId ? { profileId } : {};
    const query = {
      where: {
        organization: {
          id: org,
        },
        ...profileFilter,
      },
    };
    const pages = Math.ceil((await this._media.model.media.count(query)) / 18);
    const results = await this._media.model.media.findMany({
      where: {
        organizationId: org,
        deletedAt: null,
        ...profileFilter,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        originalName: true,
        path: true,
        thumbnail: true,
        alt: true,
        thumbnailTimestamp: true,
      },
      skip: pageNum * 18,
      take: 18,
    });

    return {
      pages,
      results,
    };
  }
}

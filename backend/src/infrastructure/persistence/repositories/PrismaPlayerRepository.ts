import { Injectable } from '@nestjs/common';
import {
  PlayerRecord,
  PlayerRepository,
} from '../../../application/ports/PlayerRepository';
import { asUuid, Uuid } from '../../../domain/shared/Identifier';
import { PrismaUnitOfWork } from '../PrismaUnitOfWork';

@Injectable()
export class PrismaPlayerRepository implements PlayerRepository {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  public async upsert(player: PlayerRecord): Promise<PlayerRecord> {
    const client = this.uow.getClient();
    const row = await client.player.upsert({
      where: { id: player.id },
      create: {
        id: player.id,
        nickname: player.nickname,
      },
      update: { nickname: player.nickname },
    });
    return {
      id: asUuid(row.id),
      nickname: row.nickname,
      createdAt: row.createdAt,
    };
  }

  public async findById(id: Uuid): Promise<PlayerRecord | null> {
    const client = this.uow.getClient();
    const row = await client.player.findUnique({ where: { id } });
    return row === null
      ? null
      : { id: asUuid(row.id), nickname: row.nickname, createdAt: row.createdAt };
  }
}

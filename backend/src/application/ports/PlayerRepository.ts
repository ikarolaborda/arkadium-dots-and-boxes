import { Uuid } from '../../domain/shared/Identifier';

export interface PlayerRecord {
  readonly id: Uuid;
  readonly nickname: string;
  readonly createdAt: Date;
}

export const PLAYER_REPOSITORY = Symbol('PLAYER_REPOSITORY');

export interface PlayerRepository {
  upsert(player: PlayerRecord): Promise<PlayerRecord>;
  findById(id: Uuid): Promise<PlayerRecord | null>;
}

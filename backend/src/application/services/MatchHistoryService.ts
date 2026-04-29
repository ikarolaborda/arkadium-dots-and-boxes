import { Inject, Injectable } from '@nestjs/common';
import {
  CompletedGameSummary,
  GAME_REPOSITORY,
  GameRepository,
} from '../ports/GameRepository';

@Injectable()
export class MatchHistoryService {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
  ) {}

  public list(limit: number, offset: number): Promise<CompletedGameSummary[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);
    return this.games.listMatchHistory(safeLimit, safeOffset);
  }
}

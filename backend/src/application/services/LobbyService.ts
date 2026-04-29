import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  GameEngine,
  GameRules,
  GameState,
  PlayerSeat,
  DEFAULT_GAME_RULES,
} from '../../domain/game';
import { asUuid, Uuid } from '../../domain/shared/Identifier';
import {
  GameFullError,
  GameNotFoundError,
  GameNotJoinableError,
} from '../../domain/shared/DomainError';
import { GameStatus } from '../../domain/game/GameStatus';
import { GameRepository, GAME_REPOSITORY } from '../ports/GameRepository';
import {
  PLAYER_REPOSITORY,
  PlayerRepository,
} from '../ports/PlayerRepository';

export interface CreateGameCommand {
  readonly hostPlayerId: Uuid;
  readonly hostNickname: string;
  readonly rules?: Partial<GameRules>;
}

export interface JoinGameCommand {
  readonly gameId: Uuid;
  readonly playerId: Uuid;
  readonly nickname: string;
}

@Injectable()
export class LobbyService {
  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(PLAYER_REPOSITORY) private readonly players: PlayerRepository,
  ) {}

  public async createGame(cmd: CreateGameCommand): Promise<GameState> {
    const rules: GameRules = { ...DEFAULT_GAME_RULES, ...cmd.rules };
    await this.players.upsert({
      id: cmd.hostPlayerId,
      nickname: cmd.hostNickname,
      createdAt: new Date(),
    });
    const hostSeat: PlayerSeat = {
      playerId: cmd.hostPlayerId,
      nickname: cmd.hostNickname,
      seatIndex: 0,
      score: 0,
      connected: false,
    };
    /*
     * The lobby creates the game in WAITING status with one seat reserved.
     * The engine itself only knows IN_PROGRESS games — we keep waiting-state
     * orchestration in the lobby boundary so the engine remains play-only.
     */
    const id = asUuid(randomUUID());
    const seedState: GameState = {
      id,
      rules,
      status: GameStatus.Waiting,
      currentTurnSeatIndex: 0,
      seats: [hostSeat],
      horizontalLines: [],
      verticalLines: [],
      boxes: [],
      moveCount: 0,
      winnerSeatIndex: null,
      draw: false,
    };
    await this.games.create(seedState, cmd.hostPlayerId);
    return seedState;
  }

  public async joinGame(cmd: JoinGameCommand): Promise<GameState> {
    const game = await this.games.findById(cmd.gameId);
    if (game === null) {
      throw new GameNotFoundError(cmd.gameId);
    }
    if (game.status !== GameStatus.Waiting) {
      throw new GameNotJoinableError(`status=${game.status}`);
    }
    if (game.seats.length >= game.rules.maxPlayers) {
      throw new GameFullError();
    }
    if (game.seats.some((s) => s.playerId === cmd.playerId)) {
      return game;
    }
    await this.players.upsert({
      id: cmd.playerId,
      nickname: cmd.nickname,
      createdAt: new Date(),
    });
    const updated = await this.games.joinSeat(
      cmd.gameId,
      cmd.playerId,
      cmd.nickname,
    );
    /*
     * Auto-start once minPlayers is reached. The first player to join after
     * the host implicitly starts the game; later we could add an explicit
     * "host_starts" mode if product wants more control.
     */
    if (
      updated.seats.length >= updated.rules.minPlayers &&
      updated.status === GameStatus.Waiting
    ) {
      const ready = GameEngine.initialise(
        updated.id,
        updated.rules,
        updated.seats,
      );
      await this.games.completeGame; /* no-op: type guard, see below */
      await this.replaceState(ready);
      return ready;
    }
    return updated;
  }

  public async listJoinable(limit = 20): Promise<GameState[]> {
    return this.games.listJoinable(limit);
  }

  private async replaceState(state: GameState): Promise<void> {
    /*
     * Used to flip a WAITING game into IN_PROGRESS without recording it as
     * a move. We piggyback on commitMove with a synthetic sequence-zero move
     * marker would over-pollute the moves table, so we go through a dedicated
     * repository path instead — see PrismaGameRepository.startGame.
     */
    const repo = this.games as unknown as { startGame?: (s: GameState) => Promise<void> };
    if (repo.startGame !== undefined) {
      await repo.startGame(state);
    }
  }
}

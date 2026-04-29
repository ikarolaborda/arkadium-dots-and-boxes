import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  GameEngine,
  GameState,
  Line,
  GameStatus,
} from '../../domain/game';
import {
  GameNotFoundError,
  InvalidMoveError,
} from '../../domain/shared/DomainError';
import { asUuid, Uuid } from '../../domain/shared/Identifier';
import {
  GAME_REPOSITORY,
  GameRepository,
  PersistedMove,
} from '../ports/GameRepository';
import {
  GAME_BROADCASTER,
  GameBroadcaster,
} from '../ports/GameBroadcaster';
import { UNIT_OF_WORK, UnitOfWork } from '../ports/UnitOfWork';
import { GameStateMapper } from './GameStateMapper';

export interface PlayMoveCommand {
  readonly gameId: Uuid;
  readonly playerId: Uuid;
  readonly orientation: 'H' | 'V';
  readonly x: number;
  readonly y: number;
}

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);

  constructor(
    @Inject(GAME_REPOSITORY) private readonly games: GameRepository,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: GameBroadcaster,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
  ) {}

  public async loadSnapshot(gameId: Uuid): Promise<GameState> {
    const state = await this.games.findById(gameId);
    if (state === null) {
      throw new GameNotFoundError(gameId);
    }
    return state;
  }

  public async playMove(cmd: PlayMoveCommand): Promise<GameState> {
    return this.uow.transaction(async () => {
      const state = await this.games.findById(cmd.gameId);
      if (state === null) {
        throw new GameNotFoundError(cmd.gameId);
      }
      if (state.status !== GameStatus.InProgress) {
        throw new InvalidMoveError(`game status=${state.status}`);
      }
      const seat = state.seats.find((s) => s.playerId === cmd.playerId);
      if (seat === undefined) {
        throw new InvalidMoveError('player is not seated in this game');
      }
      const line = new Line(cmd.orientation, cmd.x, cmd.y);
      const outcome = GameEngine.applyMove(state, seat.seatIndex, line);

      const move: Omit<PersistedMove, 'createdAt'> = {
        id: asUuid(randomUUID()),
        gameId: state.id,
        sequence: outcome.state.moveCount,
        playerId: seat.playerId,
        seatIndex: seat.seatIndex,
        lineOrientation: line.orientation,
        lineX: line.x,
        lineY: line.y,
        completedBoxes: outcome.completedBoxes.length,
      };

      await this.games.commitMove({ state: outcome.state, move });

      if (outcome.state.status === GameStatus.Completed) {
        await this.games.completeGame(outcome.state);
      }

      this.broadcaster.emitDelta(
        state.id,
        GameStateMapper.toDelta({
          state: outcome.state,
          line,
          bySeatIndex: seat.seatIndex,
          completedBoxes: outcome.completedBoxes,
          nextTurnSeatIndex: outcome.nextTurnSeatIndex,
        }),
      );

      if (outcome.state.status === GameStatus.Completed) {
        this.broadcaster.emitGameEnded(state.id, {
          winnerSeatIndex: outcome.state.winnerSeatIndex,
          draw: outcome.state.draw,
        });
        this.logger.log(
          `game completed id=${state.id} winnerSeat=${outcome.state.winnerSeatIndex} draw=${outcome.state.draw} moves=${outcome.state.moveCount}`,
        );
      }

      return outcome.state;
    });
  }

  public async setConnection(
    gameId: Uuid,
    playerId: Uuid,
    connected: boolean,
  ): Promise<void> {
    await this.games.setSeatConnection(gameId, playerId, connected);
    if (connected) {
      this.broadcaster.emitPlayerReconnected(gameId, playerId);
      return;
    }
    this.broadcaster.emitPlayerDisconnected(gameId, playerId);
  }

  public async forfeitOnTimeout(
    gameId: Uuid,
    playerId: Uuid,
  ): Promise<void> {
    const state = await this.games.findById(gameId);
    if (state === null || state.status !== GameStatus.InProgress) {
      return;
    }
    const seat = state.seats.find((s) => s.playerId === playerId);
    if (seat === undefined) {
      return;
    }
    const abandoned = GameEngine.abandon(state, seat.seatIndex);
    await this.games.abandonGame(abandoned);
    this.broadcaster.emitGameEnded(gameId, {
      winnerSeatIndex: abandoned.winnerSeatIndex,
      draw: abandoned.draw,
    });
    this.logger.warn(
      `game abandoned id=${gameId} forfeitSeat=${seat.seatIndex} winnerSeat=${abandoned.winnerSeatIndex}`,
    );
  }
}

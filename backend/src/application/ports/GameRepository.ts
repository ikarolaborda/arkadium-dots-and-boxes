import { GameState } from '../../domain/game';
import { Uuid } from '../../domain/shared/Identifier';

export interface PersistedMove {
  readonly id: Uuid;
  readonly gameId: Uuid;
  readonly sequence: number;
  readonly playerId: Uuid;
  readonly seatIndex: number;
  readonly lineOrientation: 'H' | 'V';
  readonly lineX: number;
  readonly lineY: number;
  readonly completedBoxes: number;
  readonly createdAt: Date;
}

export interface CompletedGameSummary {
  readonly id: Uuid;
  readonly gridSize: number;
  readonly winnerSeatIndex: number | null;
  readonly draw: boolean;
  readonly moveCount: number;
  readonly durationMs: number;
  readonly completedAt: Date;
  readonly seats: ReadonlyArray<{
    readonly playerId: Uuid;
    readonly nickname: string;
    readonly seatIndex: number;
    readonly score: number;
  }>;
}

export interface CommitMoveCommand {
  readonly state: GameState;
  readonly move: Omit<PersistedMove, 'id' | 'createdAt'> & { readonly id: Uuid };
}

export const GAME_REPOSITORY = Symbol('GAME_REPOSITORY');

export interface GameRepository {
  create(state: GameState, hostPlayerId: Uuid): Promise<void>;
  findById(id: Uuid): Promise<GameState | null>;
  listJoinable(limit: number): Promise<GameState[]>;
  joinSeat(gameId: Uuid, playerId: Uuid, nickname: string): Promise<GameState>;
  /*
   * startGame flips a WAITING row to IN_PROGRESS and persists the freshly
   * initialised state (the line matrices). Distinct from commitMove because
   * no move is recorded — the lobby orchestrates this when minPlayers is
   * reached and the GameEngine is asked to allocate the board.
   */
  startGame(state: GameState): Promise<void>;
  setSeatConnection(
    gameId: Uuid,
    playerId: Uuid,
    connected: boolean,
  ): Promise<void>;
  commitMove(command: CommitMoveCommand): Promise<void>;
  completeGame(state: GameState): Promise<void>;
  abandonGame(state: GameState): Promise<void>;
  listMatchHistory(limit: number, offset: number): Promise<CompletedGameSummary[]>;
}

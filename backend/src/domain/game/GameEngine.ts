import {
  GameAlreadyEndedError,
  InvalidMoveError,
  LineAlreadyDrawnError,
  LineOutOfBoundsError,
  NotYourTurnError,
} from '../shared/DomainError';
import { Box } from './Box';
import { GameEvent } from './GameEvent';
import {
  GameState,
  horizontalGridDimensions,
  initialiseLineMatrix,
  totalBoxes,
  verticalGridDimensions,
} from './GameState';
import { GameStatus, GameStatusValue } from './GameStatus';
import { Line } from './Line';
import { PlayerSeat, updateSeatScore } from './PlayerSeat';
import { GameRules, validateRules } from './GameRules';
import { Uuid } from '../shared/Identifier';

export interface MoveOutcome {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
  readonly completedBoxes: readonly Box[];
  readonly nextTurnSeatIndex: number;
}

/*
 * GameEngine is the single source of truth for legal-move semantics.
 * It is intentionally a stateless module of pure functions — it never
 * mutates the input, never reads the clock, and never performs IO.
 * Every call returns a new GameState plus the deterministic event stream
 * derived from that transition. This is what makes the server authoritative,
 * trivially unit-testable, and replayable from the moves table.
 */
export class GameEngine {
  public static initialise(
    id: Uuid,
    rules: GameRules,
    seats: readonly PlayerSeat[],
  ): GameState {
    validateRules(rules);
    if (seats.length < rules.minPlayers || seats.length > rules.maxPlayers) {
      throw new InvalidMoveError(
        `seats=${seats.length} not in [${rules.minPlayers},${rules.maxPlayers}]`,
      );
    }
    const h = horizontalGridDimensions(rules.gridSize);
    const v = verticalGridDimensions(rules.gridSize);
    return {
      id,
      rules,
      status: GameStatus.InProgress,
      currentTurnSeatIndex: 0,
      seats,
      horizontalLines: initialiseLineMatrix(h.rows, h.cols),
      verticalLines: initialiseLineMatrix(v.rows, v.cols),
      boxes: [],
      moveCount: 0,
      winnerSeatIndex: null,
      draw: false,
    };
  }

  public static applyMove(
    state: GameState,
    seatIndex: number,
    line: Line,
  ): MoveOutcome {
    if (state.status !== GameStatus.InProgress) {
      throw new GameAlreadyEndedError();
    }
    if (seatIndex !== state.currentTurnSeatIndex) {
      throw new NotYourTurnError();
    }
    GameEngine.assertLineInBounds(state, line);
    if (GameEngine.isLineDrawn(state, line)) {
      throw new LineAlreadyDrawnError();
    }

    const events: GameEvent[] = [];
    const horizontalLines = GameEngine.cloneMatrix(state.horizontalLines);
    const verticalLines = GameEngine.cloneMatrix(state.verticalLines);
    GameEngine.writeLine(horizontalLines, verticalLines, line, seatIndex);
    events.push({ kind: 'move_played', line, bySeatIndex: seatIndex });

    const newlyClaimed = GameEngine.detectClosedBoxes(
      horizontalLines,
      verticalLines,
      line,
      seatIndex,
    );

    let seats = state.seats;
    for (const box of newlyClaimed) {
      seats = GameEngine.updateSeatAt(seats, box.ownerSeatIndex, (s) =>
        updateSeatScore(s, 1),
      );
      events.push({ kind: 'box_claimed', box });
    }

    const boxes = newlyClaimed.length > 0 ? [...state.boxes, ...newlyClaimed] : state.boxes;
    const moveCount = state.moveCount + 1;
    const totalBoxesOnBoard = totalBoxes(state.rules.gridSize);
    const allBoxesClaimed = boxes.length >= totalBoxesOnBoard;

    /*
     * Bonus-turn rule: completing one or more boxes in a single move grants
     * exactly one extra turn. The player keeps the seat regardless of how
     * many boxes the move closed simultaneously (the classic chain).
     */
    const grantedBonus = newlyClaimed.length > 0;
    const nextTurnSeatIndex = grantedBonus
      ? seatIndex
      : (seatIndex + 1) % seats.length;

    let status: GameStatusValue = state.status;
    let winnerSeatIndex: number | null = state.winnerSeatIndex;
    let draw = state.draw;
    if (allBoxesClaimed) {
      status = GameStatus.Completed;
      const resolution = GameEngine.resolveWinner(seats);
      winnerSeatIndex = resolution.winnerSeatIndex;
      draw = resolution.draw;
      events.push({
        kind: 'game_ended',
        status,
        winnerSeatIndex,
        draw,
      });
    } else if (!grantedBonus) {
      events.push({ kind: 'turn_changed', nextSeatIndex: nextTurnSeatIndex });
    }

    const nextState: GameState = {
      ...state,
      status,
      seats,
      horizontalLines,
      verticalLines,
      boxes,
      moveCount,
      currentTurnSeatIndex:
        status === GameStatus.Completed ? state.currentTurnSeatIndex : nextTurnSeatIndex,
      winnerSeatIndex,
      draw,
    };

    return {
      state: nextState,
      events,
      completedBoxes: newlyClaimed,
      nextTurnSeatIndex,
    };
  }

  public static abandon(state: GameState, forfeitSeatIndex: number): GameState {
    if (state.status !== GameStatus.InProgress) {
      return state;
    }
    /*
     * Forfeit policy: the surviving seat with the highest score wins.
     * If exactly one opponent remains, they win outright. Ties stay as draws
     * — abandonment never invents a winner that did not earn it on the board.
     */
    const survivors = state.seats.filter((_, idx) => idx !== forfeitSeatIndex);
    const top = survivors.reduce<PlayerSeat | null>(
      (best, s) => (best === null || s.score > best.score ? s : best),
      null,
    );
    const winnerSeatIndex =
      top === null
        ? null
        : survivors.filter((s) => s.score === top.score).length > 1
          ? null
          : top.seatIndex;
    return {
      ...state,
      status: GameStatus.Abandoned,
      winnerSeatIndex,
      draw: winnerSeatIndex === null,
    };
  }

  private static assertLineInBounds(state: GameState, line: Line): void {
    if (line.orientation === 'H') {
      const h = horizontalGridDimensions(state.rules.gridSize);
      if (
        line.y < 0 ||
        line.y >= h.rows ||
        line.x < 0 ||
        line.x >= h.cols
      ) {
        throw new LineOutOfBoundsError();
      }
      return;
    }
    const v = verticalGridDimensions(state.rules.gridSize);
    if (
      line.y < 0 ||
      line.y >= v.rows ||
      line.x < 0 ||
      line.x >= v.cols
    ) {
      throw new LineOutOfBoundsError();
    }
  }

  private static isLineDrawn(state: GameState, line: Line): boolean {
    if (line.orientation === 'H') {
      return state.horizontalLines[line.y][line.x] !== null;
    }
    return state.verticalLines[line.y][line.x] !== null;
  }

  private static writeLine(
    horizontalLines: (number | null)[][],
    verticalLines: (number | null)[][],
    line: Line,
    seatIndex: number,
  ): void {
    if (line.orientation === 'H') {
      horizontalLines[line.y][line.x] = seatIndex;
      return;
    }
    verticalLines[line.y][line.x] = seatIndex;
  }

  private static cloneMatrix(
    matrix: readonly (readonly (number | null)[])[],
  ): (number | null)[][] {
    return matrix.map((row) => [...row]);
  }

  /*
   * A box at (bx, by) is closed iff its four sides are all drawn:
   *  - top:    H(y=by,   x=bx)
   *  - bottom: H(y=by+1, x=bx)
   *  - left:   V(y=by,   x=bx)
   *  - right:  V(y=by,   x=bx+1)
   *
   * A single move can only close at most the two boxes adjacent to the
   * placed line, so we only check those (O(1) per move) rather than scanning
   * the whole board.
   */
  private static detectClosedBoxes(
    horizontalLines: readonly (readonly (number | null)[])[],
    verticalLines: readonly (readonly (number | null)[])[],
    line: Line,
    seatIndex: number,
  ): Box[] {
    const candidates: Array<{ x: number; y: number }> = [];
    if (line.orientation === 'H') {
      candidates.push({ x: line.x, y: line.y - 1 });
      candidates.push({ x: line.x, y: line.y });
    } else {
      candidates.push({ x: line.x - 1, y: line.y });
      candidates.push({ x: line.x, y: line.y });
    }
    const claimed: Box[] = [];
    for (const c of candidates) {
      if (
        GameEngine.isBoxClosed(
          horizontalLines,
          verticalLines,
          c.x,
          c.y,
        )
      ) {
        claimed.push(new Box(c.x, c.y, seatIndex));
      }
    }
    return claimed;
  }

  private static isBoxClosed(
    horizontalLines: readonly (readonly (number | null)[])[],
    verticalLines: readonly (readonly (number | null)[])[],
    bx: number,
    by: number,
  ): boolean {
    if (
      by < 0 ||
      bx < 0 ||
      by >= horizontalLines.length - 1 ||
      bx >= horizontalLines[0].length
    ) {
      return false;
    }
    if (
      by >= verticalLines.length ||
      bx + 1 >= verticalLines[0].length
    ) {
      return false;
    }
    const top = horizontalLines[by][bx];
    const bottom = horizontalLines[by + 1][bx];
    const left = verticalLines[by][bx];
    const right = verticalLines[by][bx + 1];
    return top !== null && bottom !== null && left !== null && right !== null;
  }

  private static updateSeatAt(
    seats: readonly PlayerSeat[],
    seatIndex: number,
    updater: (seat: PlayerSeat) => PlayerSeat,
  ): readonly PlayerSeat[] {
    return seats.map((s, idx) => (idx === seatIndex ? updater(s) : s));
  }

  private static resolveWinner(seats: readonly PlayerSeat[]): {
    winnerSeatIndex: number | null;
    draw: boolean;
  } {
    const top = seats.reduce<PlayerSeat | null>(
      (best, s) => (best === null || s.score > best.score ? s : best),
      null,
    );
    if (top === null) {
      return { winnerSeatIndex: null, draw: true };
    }
    const tieCount = seats.filter((s) => s.score === top.score).length;
    if (tieCount > 1) {
      return { winnerSeatIndex: null, draw: true };
    }
    return { winnerSeatIndex: top.seatIndex, draw: false };
  }
}

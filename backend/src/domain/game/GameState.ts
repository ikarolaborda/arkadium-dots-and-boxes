import { Box } from './Box';
import { GameStatusValue } from './GameStatus';
import { PlayerSeat } from './PlayerSeat';
import { GameRules } from './GameRules';
import { Uuid } from '../shared/Identifier';

/*
 * Persistent (immutable) game state. The engine returns a new GameState on
 * every transition; mutation is forbidden so we get cheap snapshots, easy
 * replay, and lock-free read paths in the gateway.
 *
 * Lines are stored as 2D arrays of seat indexes (or null) rather than a flat
 * Set<string>. The 2D layout makes both rendering and box-completion checks
 * O(1) array reads instead of hashing — and JSONB serialisation stays trivial.
 *
 * For an N-dot grid, there are N rows of (N-1) horizontal lines and (N-1)
 * rows of N vertical lines. Boxes are an (N-1) x (N-1) matrix.
 */

export interface GameState {
  readonly id: Uuid;
  readonly rules: GameRules;
  readonly status: GameStatusValue;
  readonly currentTurnSeatIndex: number;
  readonly seats: readonly PlayerSeat[];
  readonly horizontalLines: readonly (readonly (number | null)[])[];
  readonly verticalLines: readonly (readonly (number | null)[])[];
  readonly boxes: readonly Box[];
  readonly moveCount: number;
  readonly winnerSeatIndex: number | null;
  readonly draw: boolean;
}

export const horizontalGridDimensions = (
  gridSize: number,
): { rows: number; cols: number } => ({ rows: gridSize, cols: gridSize - 1 });

export const verticalGridDimensions = (
  gridSize: number,
): { rows: number; cols: number } => ({ rows: gridSize - 1, cols: gridSize });

export const totalBoxes = (gridSize: number): number =>
  (gridSize - 1) * (gridSize - 1);

export const totalLines = (gridSize: number): number => {
  const h = horizontalGridDimensions(gridSize);
  const v = verticalGridDimensions(gridSize);
  return h.rows * h.cols + v.rows * v.cols;
};

export const initialiseLineMatrix = (
  rows: number,
  cols: number,
): (number | null)[][] =>
  Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null as number | null),
  );

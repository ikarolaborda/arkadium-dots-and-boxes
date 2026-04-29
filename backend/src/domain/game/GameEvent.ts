import { Box } from './Box';
import { Line } from './Line';
import { GameStatusValue } from './GameStatus';

export type GameEvent =
  | { kind: 'move_played'; line: Line; bySeatIndex: number }
  | { kind: 'box_claimed'; box: Box }
  | { kind: 'turn_changed'; nextSeatIndex: number }
  | { kind: 'game_ended'; status: GameStatusValue; winnerSeatIndex: number | null; draw: boolean };

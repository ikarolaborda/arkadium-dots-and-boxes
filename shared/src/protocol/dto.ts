export type LineOrientation = 'H' | 'V';

export interface LineDto {
  readonly orientation: LineOrientation;
  readonly x: number;
  readonly y: number;
}

export interface MoveDto {
  readonly gameId: string;
  readonly playerId: string;
  readonly line: LineDto;
}

export interface PlayerDto {
  readonly id: string;
  readonly nickname: string;
  readonly seatIndex: number;
  readonly score: number;
  readonly connected: boolean;
}

export interface BoxDto {
  readonly x: number;
  readonly y: number;
  readonly ownerSeatIndex: number;
}

export type GameStatusDto = 'waiting' | 'in_progress' | 'completed' | 'abandoned';

export interface GameStateDto {
  readonly id: string;
  readonly status: GameStatusDto;
  readonly gridSize: number;
  readonly currentTurnSeatIndex: number;
  readonly players: readonly PlayerDto[];
  readonly horizontalLines: readonly (number | null)[][];
  readonly verticalLines: readonly (number | null)[][];
  readonly boxes: readonly BoxDto[];
  readonly moveCount: number;
  readonly winnerSeatIndex: number | null;
  readonly draw: boolean;
}

export interface StateDeltaDto {
  readonly gameId: string;
  readonly sequence: number;
  readonly line: LineDto;
  readonly bySeatIndex: number;
  readonly completedBoxes: readonly BoxDto[];
  readonly nextTurnSeatIndex: number;
  readonly status: GameStatusDto;
  readonly winnerSeatIndex: number | null;
  readonly draw: boolean;
}

export interface JoinGamePayload {
  readonly gameId: string;
  readonly token: string;
}

export interface ResumePayload {
  readonly token: string;
}

import { Game, GamePlayer, GameStatus as PrismaGameStatus } from '@prisma/client';
import {
  GameState,
  PlayerSeat,
  Box,
  GameRules,
} from '../../../domain/game';
import { GameStatus, GameStatusValue } from '../../../domain/game/GameStatus';
import { asUuid } from '../../../domain/shared/Identifier';

interface SerializedState {
  rules: GameRules;
  horizontalLines: (number | null)[][];
  verticalLines: (number | null)[][];
  boxes: Array<{ x: number; y: number; ownerSeatIndex: number }>;
  moveCount: number;
  draw: boolean;
}

const fromPrismaStatus = (status: PrismaGameStatus): GameStatusValue => {
  switch (status) {
    case 'WAITING':
      return GameStatus.Waiting;
    case 'IN_PROGRESS':
      return GameStatus.InProgress;
    case 'COMPLETED':
      return GameStatus.Completed;
    case 'ABANDONED':
      return GameStatus.Abandoned;
  }
};

export const toPrismaStatus = (status: GameStatusValue): PrismaGameStatus => {
  switch (status) {
    case GameStatus.Waiting:
      return 'WAITING';
    case GameStatus.InProgress:
      return 'IN_PROGRESS';
    case GameStatus.Completed:
      return 'COMPLETED';
    case GameStatus.Abandoned:
      return 'ABANDONED';
  }
};

export const serializeState = (
  state: GameState,
): SerializedState => ({
  rules: state.rules,
  horizontalLines: state.horizontalLines.map((r) => [...r]),
  verticalLines: state.verticalLines.map((r) => [...r]),
  boxes: state.boxes.map((b) => ({
    x: b.x,
    y: b.y,
    ownerSeatIndex: b.ownerSeatIndex,
  })),
  moveCount: state.moveCount,
  draw: state.draw,
});

export const deserialiseState = (
  game: Game & { players: GamePlayer[] & Array<{ player: { nickname: string } }> },
): GameState => {
  const raw = game.state as unknown as SerializedState;
  const seats: PlayerSeat[] = [...game.players]
    .sort((a, b) => a.seatIndex - b.seatIndex)
    .map((row) => ({
      playerId: asUuid(row.playerId),
      nickname: row.player.nickname,
      seatIndex: row.seatIndex,
      score: row.score,
      connected: row.disconnectedAt === null,
    }));
  return {
    id: asUuid(game.id),
    rules: raw.rules,
    status: fromPrismaStatus(game.status),
    currentTurnSeatIndex: game.currentTurnSeatIdx,
    seats,
    horizontalLines: raw.horizontalLines,
    verticalLines: raw.verticalLines,
    boxes: raw.boxes.map((b) => new Box(b.x, b.y, b.ownerSeatIndex)),
    moveCount: raw.moveCount,
    winnerSeatIndex:
      seats.find((s) => s.playerId === (game.winnerId ?? '__none__'))?.seatIndex ?? null,
    draw: raw.draw,
  };
};

import { GameStateDto, StateDeltaDto } from '@dab/shared';
import { Uuid } from '../../domain/shared/Identifier';

export const GAME_BROADCASTER = Symbol('GAME_BROADCASTER');

/*
 * Output port: how the application layer pushes events back to clients
 * without depending on Socket.IO. The infrastructure adapter translates
 * these calls into io.to(room).emit(...) under the hood.
 */
export interface GameBroadcaster {
  emitSnapshot(gameId: Uuid, snapshot: GameStateDto): void;
  emitDelta(gameId: Uuid, delta: StateDeltaDto): void;
  emitPlayerJoined(gameId: Uuid, payload: { playerId: Uuid; seatIndex: number; nickname: string }): void;
  emitPlayerDisconnected(gameId: Uuid, playerId: Uuid): void;
  emitPlayerReconnected(gameId: Uuid, playerId: Uuid): void;
  emitGameEnded(gameId: Uuid, payload: { winnerSeatIndex: number | null; draw: boolean }): void;
}

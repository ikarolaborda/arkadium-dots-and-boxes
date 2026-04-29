import { Uuid } from '../shared/Identifier';

export interface PlayerSeat {
  readonly playerId: Uuid;
  readonly nickname: string;
  readonly seatIndex: number;
  readonly score: number;
  readonly connected: boolean;
}

export const updateSeatScore = (
  seat: PlayerSeat,
  delta: number,
): PlayerSeat => ({ ...seat, score: seat.score + delta });

export const setSeatConnected = (
  seat: PlayerSeat,
  connected: boolean,
): PlayerSeat => ({ ...seat, connected });

import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { GameStateDto, ServerEvent, StateDeltaDto } from '@dab/shared';
import { GameBroadcaster } from '../../application/ports/GameBroadcaster';
import { Uuid } from '../../domain/shared/Identifier';

@Injectable()
export class SocketIoGameBroadcaster implements GameBroadcaster {
  private readonly logger = new Logger(SocketIoGameBroadcaster.name);
  private server: Server | null = null;

  public bind(server: Server): void {
    this.server = server;
  }

  public emitSnapshot(gameId: Uuid, snapshot: GameStateDto): void {
    this.emit(gameId, ServerEvent.StateSnapshot, snapshot);
  }

  public emitDelta(gameId: Uuid, delta: StateDeltaDto): void {
    this.emit(gameId, ServerEvent.StateDelta, delta);
  }

  public emitPlayerJoined(
    gameId: Uuid,
    payload: { playerId: Uuid; seatIndex: number; nickname: string },
  ): void {
    this.emit(gameId, ServerEvent.PlayerJoined, payload);
  }

  public emitPlayerDisconnected(gameId: Uuid, playerId: Uuid): void {
    this.emit(gameId, ServerEvent.PlayerDisconnected, { playerId });
  }

  public emitPlayerReconnected(gameId: Uuid, playerId: Uuid): void {
    this.emit(gameId, ServerEvent.PlayerReconnected, { playerId });
  }

  public emitGameEnded(
    gameId: Uuid,
    payload: { winnerSeatIndex: number | null; draw: boolean },
  ): void {
    this.emit(gameId, ServerEvent.GameEnded, payload);
  }

  private emit(gameId: Uuid, event: string, payload: unknown): void {
    if (this.server === null) {
      this.logger.warn(`broadcast skipped (server not bound) event=${event}`);
      return;
    }
    this.server.to(SocketIoGameBroadcaster.roomFor(gameId)).emit(event, payload);
  }

  public static roomFor(gameId: Uuid): string {
    return `game:${gameId}`;
  }
}

import { io, Socket } from 'socket.io-client';
import {
  ClientEvent,
  GameStateDto,
  JoinGamePayload,
  MoveDto,
  ProtocolError,
  ServerEvent,
  StateDeltaDto,
} from '@dab/shared';

export interface RealtimeHandlers {
  onSnapshot: (snapshot: GameStateDto) => void;
  onDelta: (delta: StateDeltaDto) => void;
  onPlayerJoined: (payload: { playerId: string; seatIndex: number; nickname: string }) => void;
  onPlayerDisconnected: (payload: { playerId: string }) => void;
  onPlayerReconnected: (payload: { playerId: string }) => void;
  onGameEnded: (payload: { winnerSeatIndex: number | null; draw: boolean }) => void;
  onError: (err: ProtocolError) => void;
  onConnectionChange: (connected: boolean) => void;
}

/*
 * Adapter around socket.io-client. The store talks to this object only —
 * never to socket.io directly — so we can swap transports or add reconnection
 * policies without touching UI code. Reconnection is handled by socket.io
 * itself; we only translate its lifecycle events into the handler shape.
 */
export class RealtimeClient {
  private socket: Socket | null = null;

  public connect(token: string, handlers: RealtimeHandlers): void {
    if (this.socket !== null) {
      this.disconnect();
    }
    const url = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? '';
    this.socket = io(url, {
      transports: ['websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4_000,
    });
    this.socket.on('connect', () => handlers.onConnectionChange(true));
    this.socket.on('disconnect', () => handlers.onConnectionChange(false));
    this.socket.on(ServerEvent.StateSnapshot, handlers.onSnapshot);
    this.socket.on(ServerEvent.StateDelta, handlers.onDelta);
    this.socket.on(ServerEvent.PlayerJoined, handlers.onPlayerJoined);
    this.socket.on(ServerEvent.PlayerDisconnected, handlers.onPlayerDisconnected);
    this.socket.on(ServerEvent.PlayerReconnected, handlers.onPlayerReconnected);
    this.socket.on(ServerEvent.GameEnded, handlers.onGameEnded);
    this.socket.on(ServerEvent.Error, handlers.onError);
  }

  public joinGame(payload: JoinGamePayload): void {
    this.socket?.emit(ClientEvent.JoinGame, payload);
  }

  public playMove(payload: MoveDto): void {
    this.socket?.emit(ClientEvent.PlayMove, payload);
  }

  public resume(payload: { gameId: string }): void {
    this.socket?.emit(ClientEvent.Resume, payload);
  }

  public leave(payload: { gameId: string }): void {
    this.socket?.emit(ClientEvent.LeaveGame, payload);
  }

  public disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const realtimeClient = new RealtimeClient();

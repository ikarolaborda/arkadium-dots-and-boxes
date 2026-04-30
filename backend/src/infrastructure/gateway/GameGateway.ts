import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  ClientEvent,
  JoinGamePayload,
  MoveDto,
  ProtocolErrorCode,
  ServerEvent,
} from '@dab/shared';
import { DomainError } from '../../domain/shared/DomainError';
import { GameService } from '../../application/services/GameService';
import { GameStateMapper } from '../../application/services/GameStateMapper';
import { LobbyService } from '../../application/services/LobbyService';
import { asUuid, isUuid } from '../../domain/shared/Identifier';
import { PlayerTokenService } from '../auth/PlayerToken';
import { DisconnectionScheduler } from './DisconnectionScheduler';
import { SocketIoGameBroadcaster } from './SocketIoGameBroadcaster';

const FORFEIT_GRACE_MS = Number(process.env.FORFEIT_GRACE_MS ?? 30_000);

interface SocketContext {
  readonly playerId: string;
  readonly nickname: string;
  readonly joinedGames: Set<string>;
}

@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_ORIGIN ?? '*', credentials: true },
})
export class GameGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(GameGateway.name);

  @WebSocketServer()
  private server!: Server;

  private readonly contexts = new WeakMap<Socket, SocketContext>();

  constructor(
    private readonly lobby: LobbyService,
    private readonly games: GameService,
    private readonly tokens: PlayerTokenService,
    private readonly broadcaster: SocketIoGameBroadcaster,
    private readonly scheduler: DisconnectionScheduler,
  ) {}

  public afterInit(): void {
    const server = this.server;
    this.broadcaster.bind(server);
    /*
     * Authentication middleware. We intentionally trust the JWT on every
     * incoming connection rather than per-message — keeping the wire chatty
     * but the trust boundary explicit. A failed handshake refuses the socket
     * before any room is joined.
     */
    server.use((socket, next) => {
      const token = String(socket.handshake.auth?.token ?? '');
      if (token === '') {
        return next(new Error('UNAUTHORIZED'));
      }
      try {
        const claims = this.tokens.verify(token);
        this.contexts.set(socket as unknown as Socket, {
          playerId: claims.playerId,
          nickname: claims.nickname,
          joinedGames: new Set(),
        });
        next();
      } catch {
        next(new Error('UNAUTHORIZED'));
      }
    });
  }

  public handleConnection(client: Socket): void {
    this.logger.debug(`socket connected id=${client.id}`);
  }

  public async handleDisconnect(client: Socket): Promise<void> {
    const ctx = this.contexts.get(client);
    if (ctx === undefined) {
      return;
    }
    for (const gameId of ctx.joinedGames) {
      const id = asUuid(gameId);
      const playerId = asUuid(ctx.playerId);
      await this.games.setConnection(id, playerId, false).catch((err) => {
        this.logger.error('setConnection(false) failed', err as Error);
      });
      this.scheduler.schedule(id, playerId, FORFEIT_GRACE_MS, () =>
        this.games.forfeitOnTimeout(id, playerId),
      );
    }
  }

  @SubscribeMessage(ClientEvent.JoinGame)
  public async onJoinGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: JoinGamePayload,
  ): Promise<void> {
    const ctx = this.requireContext(client);
    if (!isUuid(payload.gameId)) {
      this.emitError(client, ProtocolErrorCode.InvalidMove, 'invalid gameId');
      return;
    }
    try {
      const state = await this.lobby.joinGame({
        gameId: asUuid(payload.gameId),
        playerId: asUuid(ctx.playerId),
        nickname: ctx.nickname,
      });
      const room = SocketIoGameBroadcaster.roomFor(state.id);
      await client.join(room);
      ctx.joinedGames.add(state.id);
      await this.games.setConnection(
        state.id,
        asUuid(ctx.playerId),
        true,
      );
      this.scheduler.cancel(state.id, asUuid(ctx.playerId));
      const snapshot = GameStateMapper.toSnapshot(state);
      this.broadcaster.emitPlayerJoined(state.id, {
        playerId: asUuid(ctx.playerId),
        seatIndex:
          state.seats.find((s) => s.playerId === ctx.playerId)?.seatIndex ?? -1,
        nickname: ctx.nickname,
      });
      /*
       * Broadcast the post-join snapshot to the whole room rather than just
       * the joining socket. This is what flips other players from the
       * waiting view (no line matrices yet) to the in-progress view when
       * the lobby auto-starts the game on the second join.
       */
      this.broadcaster.emitSnapshot(state.id, snapshot);
    } catch (err) {
      this.handleError(client, err);
    }
  }

  @SubscribeMessage(ClientEvent.PlayMove)
  public async onPlayMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MoveDto,
  ): Promise<void> {
    const ctx = this.requireContext(client);
    if (!isUuid(payload.gameId)) {
      this.emitError(client, ProtocolErrorCode.InvalidMove, 'invalid gameId');
      return;
    }
    try {
      await this.games.playMove({
        gameId: asUuid(payload.gameId),
        playerId: asUuid(ctx.playerId),
        orientation: payload.line.orientation,
        x: payload.line.x,
        y: payload.line.y,
      });
    } catch (err) {
      this.handleError(client, err);
    }
  }

  @SubscribeMessage(ClientEvent.LeaveGame)
  public async onLeaveGame(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { gameId: string },
  ): Promise<void> {
    const ctx = this.requireContext(client);
    if (!isUuid(payload.gameId)) {
      return;
    }
    const id = asUuid(payload.gameId);
    await client.leave(SocketIoGameBroadcaster.roomFor(id));
    ctx.joinedGames.delete(id);
    await this.games.setConnection(id, asUuid(ctx.playerId), false);
  }

  @SubscribeMessage(ClientEvent.Resume)
  public async onResume(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { gameId: string },
  ): Promise<void> {
    const ctx = this.requireContext(client);
    if (!isUuid(payload.gameId)) {
      this.emitError(client, ProtocolErrorCode.InvalidMove, 'invalid gameId');
      return;
    }
    try {
      const state = await this.games.loadSnapshot(asUuid(payload.gameId));
      await client.join(SocketIoGameBroadcaster.roomFor(state.id));
      ctx.joinedGames.add(state.id);
      await this.games.setConnection(
        state.id,
        asUuid(ctx.playerId),
        true,
      );
      this.scheduler.cancel(state.id, asUuid(ctx.playerId));
      client.emit(ServerEvent.StateSnapshot, GameStateMapper.toSnapshot(state));
    } catch (err) {
      this.handleError(client, err);
    }
  }

  private requireContext(client: Socket): SocketContext {
    const ctx = this.contexts.get(client);
    if (ctx === undefined) {
      client.disconnect(true);
      throw new Error('socket missing context');
    }
    return ctx;
  }

  private handleError(client: Socket, err: unknown): void {
    if (err instanceof DomainError) {
      this.emitError(client, err.code, err.message);
      return;
    }
    this.logger.error('gateway error', err as Error);
    this.emitError(client, ProtocolErrorCode.Internal, 'internal error');
  }

  private emitError(
    client: Socket,
    code: string,
    message: string,
  ): void {
    client.emit(ServerEvent.Error, { code, message });
  }
}

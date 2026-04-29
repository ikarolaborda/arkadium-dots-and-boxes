import { Injectable } from '@nestjs/common';
import { GameStatus as PrismaGameStatus } from '@prisma/client';
import {
  CommitMoveCommand,
  CompletedGameSummary,
  GameRepository,
} from '../../../application/ports/GameRepository';
import { GameState } from '../../../domain/game';
import { GameStatus } from '../../../domain/game/GameStatus';
import { asUuid, Uuid } from '../../../domain/shared/Identifier';
import { PrismaUnitOfWork } from '../PrismaUnitOfWork';
import {
  deserialiseState,
  serializeState,
  toPrismaStatus,
} from '../mappers/GameStateMapper';

@Injectable()
export class PrismaGameRepository implements GameRepository {
  constructor(private readonly uow: PrismaUnitOfWork) {}

  public async create(state: GameState, hostPlayerId: Uuid): Promise<void> {
    const client = this.uow.getClient();
    await client.game.create({
      data: {
        id: state.id,
        status: toPrismaStatus(state.status),
        gridSize: state.rules.gridSize,
        hostId: hostPlayerId,
        currentTurnSeatIdx: state.currentTurnSeatIndex,
        state: serializeState(state) as unknown as object,
        draw: state.draw,
        players: {
          create: state.seats.map((seat) => ({
            playerId: seat.playerId,
            seatIndex: seat.seatIndex,
            score: seat.score,
          })),
        },
      },
    });
  }

  public async findById(id: Uuid): Promise<GameState | null> {
    const client = this.uow.getClient();
    const game = await client.game.findUnique({
      where: { id },
      include: { players: { include: { player: true } } },
    });
    return game === null ? null : deserialiseState(game);
  }

  public async listJoinable(limit: number): Promise<GameState[]> {
    const client = this.uow.getClient();
    const rows = await client.game.findMany({
      where: { status: PrismaGameStatus.WAITING },
      include: { players: { include: { player: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(deserialiseState);
  }

  public async joinSeat(
    gameId: Uuid,
    playerId: Uuid,
    nickname: string,
  ): Promise<GameState> {
    const client = this.uow.getClient();
    const game = await client.game.findUnique({
      where: { id: gameId },
      include: { players: true },
    });
    if (game === null) {
      throw new Error('game not found');
    }
    const nextSeat = game.players.length;
    await client.gamePlayer.create({
      data: {
        gameId,
        playerId,
        seatIndex: nextSeat,
      },
    });
    void nickname;
    const reloaded = await client.game.findUniqueOrThrow({
      where: { id: gameId },
      include: { players: { include: { player: true } } },
    });
    return deserialiseState(reloaded);
  }

  public async startGame(state: GameState): Promise<void> {
    const client = this.uow.getClient();
    await client.game.update({
      where: { id: state.id },
      data: {
        status: PrismaGameStatus.IN_PROGRESS,
        startedAt: new Date(),
        currentTurnSeatIdx: state.currentTurnSeatIndex,
        state: serializeState(state) as unknown as object,
      },
    });
  }

  public async setSeatConnection(
    gameId: Uuid,
    playerId: Uuid,
    connected: boolean,
  ): Promise<void> {
    const client = this.uow.getClient();
    await client.gamePlayer.update({
      where: { gameId_playerId: { gameId, playerId } },
      data: { disconnectedAt: connected ? null : new Date() },
    });
  }

  public async commitMove(command: CommitMoveCommand): Promise<void> {
    const client = this.uow.getClient();
    const winnerId = GameStateRepoSupport.resolveWinnerPlayerId(command.state);
    /*
     * Single transaction (driven by the UoW): UPDATE game state + score + turn,
     * INSERT the move row. The unique (game_id, sequence) constraint and the
     * (game_id, line_orientation, line_x, line_y) covering index in the JSONB
     * line matrix together guarantee both ordering and idempotency: a duplicate
     * commit attempt fails on P2002 and rolls back the whole batch.
     */
    await client.game.update({
      where: { id: command.state.id },
      data: {
        currentTurnSeatIdx: command.state.currentTurnSeatIndex,
        state: serializeState(command.state) as unknown as object,
        status: toPrismaStatus(command.state.status),
        winnerId,
        draw: command.state.draw,
        completedAt:
          command.state.status === GameStatus.Completed ? new Date() : null,
      },
    });

    await Promise.all(
      command.state.seats.map((seat) =>
        client.gamePlayer.update({
          where: {
            gameId_playerId: {
              gameId: command.state.id,
              playerId: seat.playerId,
            },
          },
          data: { score: seat.score },
        }),
      ),
    );

    await client.move.create({
      data: {
        id: command.move.id,
        gameId: command.move.gameId,
        sequence: command.move.sequence,
        playerId: command.move.playerId,
        seatIndex: command.move.seatIndex,
        lineOrientation: command.move.lineOrientation,
        lineX: command.move.lineX,
        lineY: command.move.lineY,
        completedBoxes: command.move.completedBoxes,
      },
    });
  }

  public async completeGame(state: GameState): Promise<void> {
    const client = this.uow.getClient();
    await client.game.update({
      where: { id: state.id },
      data: {
        status: toPrismaStatus(state.status),
        completedAt: new Date(),
        winnerId: GameStateRepoSupport.resolveWinnerPlayerId(state),
        draw: state.draw,
      },
    });
  }

  public async abandonGame(state: GameState): Promise<void> {
    const client = this.uow.getClient();
    await client.game.update({
      where: { id: state.id },
      data: {
        status: toPrismaStatus(state.status),
        completedAt: new Date(),
        winnerId: GameStateRepoSupport.resolveWinnerPlayerId(state),
        draw: state.draw,
      },
    });
  }

  public async listMatchHistory(
    limit: number,
    offset: number,
  ): Promise<CompletedGameSummary[]> {
    const client = this.uow.getClient();
    const rows = await client.game.findMany({
      where: {
        OR: [
          { status: PrismaGameStatus.COMPLETED },
          { status: PrismaGameStatus.ABANDONED },
        ],
      },
      include: { players: { include: { player: true } } },
      orderBy: { completedAt: 'desc' },
      take: limit,
      skip: offset,
    });
    return rows.map((row) => {
      const seats = row.players
        .map((p) => ({
          playerId: asUuid(p.playerId),
          nickname: p.player.nickname,
          seatIndex: p.seatIndex,
          score: p.score,
        }))
        .sort((a, b) => a.seatIndex - b.seatIndex);
      const startedAt = row.startedAt ?? row.createdAt;
      const completedAt = row.completedAt ?? new Date();
      return {
        id: asUuid(row.id),
        gridSize: row.gridSize,
        winnerSeatIndex:
          seats.find((s) => s.playerId === (row.winnerId ?? '__none__'))
            ?.seatIndex ?? null,
        draw: row.draw,
        moveCount: ((row.state as unknown as { moveCount?: number }).moveCount ?? 0),
        durationMs: completedAt.getTime() - startedAt.getTime(),
        completedAt,
        seats,
      };
    });
  }
}

class GameStateRepoSupport {
  public static resolveWinnerPlayerId(state: GameState): string | null {
    if (state.winnerSeatIndex === null) {
      return null;
    }
    const winnerSeat = state.seats[state.winnerSeatIndex];
    return winnerSeat?.playerId ?? null;
  }
}

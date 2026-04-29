import {
  BoxDto,
  GameStateDto,
  GameStatusDto,
  PlayerDto,
  StateDeltaDto,
} from '@dab/shared';
import { GameState } from '../../domain/game/GameState';
import { GameStatus, GameStatusValue } from '../../domain/game/GameStatus';
import { Box } from '../../domain/game/Box';
import { Line } from '../../domain/game/Line';

const statusToDto = (status: GameStatusValue): GameStatusDto => {
  switch (status) {
    case GameStatus.Waiting:
      return 'waiting';
    case GameStatus.InProgress:
      return 'in_progress';
    case GameStatus.Completed:
      return 'completed';
    case GameStatus.Abandoned:
      return 'abandoned';
  }
};

const boxToDto = (box: Box): BoxDto => ({
  x: box.x,
  y: box.y,
  ownerSeatIndex: box.ownerSeatIndex,
});

export class GameStateMapper {
  public static toSnapshot(state: GameState): GameStateDto {
    const players: PlayerDto[] = state.seats.map((s) => ({
      id: s.playerId,
      nickname: s.nickname,
      seatIndex: s.seatIndex,
      score: s.score,
      connected: s.connected,
    }));
    return {
      id: state.id,
      status: statusToDto(state.status),
      gridSize: state.rules.gridSize,
      currentTurnSeatIndex: state.currentTurnSeatIndex,
      players,
      horizontalLines: state.horizontalLines.map((row) => [...row]),
      verticalLines: state.verticalLines.map((row) => [...row]),
      boxes: state.boxes.map(boxToDto),
      moveCount: state.moveCount,
      winnerSeatIndex: state.winnerSeatIndex,
      draw: state.draw,
    };
  }

  public static toDelta(args: {
    state: GameState;
    line: Line;
    bySeatIndex: number;
    completedBoxes: readonly Box[];
    nextTurnSeatIndex: number;
  }): StateDeltaDto {
    return {
      gameId: args.state.id,
      sequence: args.state.moveCount,
      line: {
        orientation: args.line.orientation,
        x: args.line.x,
        y: args.line.y,
      },
      bySeatIndex: args.bySeatIndex,
      completedBoxes: args.completedBoxes.map(boxToDto),
      nextTurnSeatIndex: args.nextTurnSeatIndex,
      status: statusToDto(args.state.status),
      winnerSeatIndex: args.state.winnerSeatIndex,
      draw: args.state.draw,
    };
  }
}

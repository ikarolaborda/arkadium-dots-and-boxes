import {
  DEFAULT_GAME_RULES,
  GameEngine,
  GameStatus,
  Line,
  PlayerSeat,
  GameState,
  totalBoxes,
} from '../src/domain/game';
import {
  GameAlreadyEndedError,
  LineAlreadyDrawnError,
  LineOutOfBoundsError,
  NotYourTurnError,
} from '../src/domain/shared/DomainError';
import { asUuid } from '../src/domain/shared/Identifier';

const GAME_ID = asUuid('11111111-1111-4111-8111-111111111111');
const P1 = asUuid('22222222-2222-4222-8222-222222222222');
const P2 = asUuid('33333333-3333-4333-8333-333333333333');
const P3 = asUuid('44444444-4444-4444-8444-444444444444');

const seat = (
  playerId: ReturnType<typeof asUuid>,
  seatIndex: number,
  nickname: string,
): PlayerSeat => ({
  playerId,
  nickname,
  seatIndex,
  score: 0,
  connected: true,
});

const startGame = (gridSize = 3): GameState =>
  GameEngine.initialise(GAME_ID, { ...DEFAULT_GAME_RULES, gridSize }, [
    seat(P1, 0, 'Alice'),
    seat(P2, 1, 'Bob'),
  ]);

/* Helper: play whichever seat is on turn — used to drive deterministic
 * sequences without manually tracking the bonus-turn rule. */
const play = (state: GameState, line: Line): GameState =>
  GameEngine.applyMove(state, state.currentTurnSeatIndex, line).state;

describe('GameEngine.initialise', () => {
  it('creates an in-progress game with empty boards sized to the grid', () => {
    const state = startGame(4);
    expect(state.status).toBe(GameStatus.InProgress);
    expect(state.horizontalLines).toHaveLength(4);
    expect(state.horizontalLines[0]).toHaveLength(3);
    expect(state.verticalLines).toHaveLength(3);
    expect(state.verticalLines[0]).toHaveLength(4);
    expect(state.boxes).toEqual([]);
    expect(state.currentTurnSeatIndex).toBe(0);
    expect(state.moveCount).toBe(0);
  });

  it('rejects seat counts outside [minPlayers, maxPlayers]', () => {
    expect(() =>
      GameEngine.initialise(GAME_ID, DEFAULT_GAME_RULES, []),
    ).toThrow(/seats=0/);
  });
});

describe('GameEngine.applyMove — turn order', () => {
  it('rotates the turn after a move that does not close a box', () => {
    const state = startGame();
    const out = GameEngine.applyMove(state, 0, new Line('H', 0, 0));
    expect(out.state.currentTurnSeatIndex).toBe(1);
    expect(out.completedBoxes).toEqual([]);
    expect(out.events.find((e) => e.kind === 'turn_changed')).toBeDefined();
  });

  it('rejects a move played out of turn', () => {
    const state = startGame();
    expect(() =>
      GameEngine.applyMove(state, 1, new Line('H', 0, 0)),
    ).toThrow(NotYourTurnError);
  });
});

describe('GameEngine.applyMove — line validation', () => {
  it('rejects lines outside the board', () => {
    const state = startGame();
    expect(() =>
      GameEngine.applyMove(state, 0, new Line('H', 5, 5)),
    ).toThrow(LineOutOfBoundsError);
  });

  it('rejects a duplicate line', () => {
    let state = startGame();
    state = GameEngine.applyMove(state, 0, new Line('H', 0, 0)).state;
    expect(() =>
      GameEngine.applyMove(state, 1, new Line('H', 0, 0)),
    ).toThrow(LineAlreadyDrawnError);
  });
});

describe('GameEngine.applyMove — box completion', () => {
  it('claims a box and grants exactly one bonus turn', () => {
    let state = startGame(3);
    state = play(state, new Line('H', 0, 0));
    state = play(state, new Line('V', 0, 0));
    state = play(state, new Line('V', 1, 0));
    expect(state.currentTurnSeatIndex).toBe(1);
    const closingSeat = state.currentTurnSeatIndex;
    const closing = GameEngine.applyMove(state, closingSeat, new Line('H', 0, 1));
    expect(closing.completedBoxes).toHaveLength(1);
    expect(closing.completedBoxes[0].ownerSeatIndex).toBe(closingSeat);
    expect(closing.state.currentTurnSeatIndex).toBe(closingSeat);
    expect(closing.state.seats[closingSeat].score).toBe(1);
  });

  it('grants a single bonus turn when one move closes two boxes simultaneously', () => {
    let state = startGame(3);
    /*
     * Build the right-half scaffolding so that drawing H(1,1) closes
     * box(1,0) and box(1,1) in a single stroke. We pre-fill every other
     * side of both boxes first.
     */
    state = play(state, new Line('H', 1, 0));
    state = play(state, new Line('V', 1, 0));
    state = play(state, new Line('V', 2, 0));
    state = play(state, new Line('H', 1, 2));
    state = play(state, new Line('V', 1, 1));
    state = play(state, new Line('V', 2, 1));
    const closingSeat = state.currentTurnSeatIndex;
    const closing = GameEngine.applyMove(
      state,
      closingSeat,
      new Line('H', 1, 1),
    );
    expect(closing.completedBoxes).toHaveLength(2);
    expect(closing.state.currentTurnSeatIndex).toBe(closingSeat);
    expect(closing.state.seats[closingSeat].score).toBe(2);
  });
});

describe('GameEngine.applyMove — game end', () => {
  const playOutCompleteGame = (gridSize: number): GameState => {
    let state = startGame(gridSize);
    /*
     * Brute-force, deterministic finishing sequence: walk every legal
     * line in lexicographic order, always asking the engine which seat
     * is on turn. The order is deterministic so the result is repeatable.
     */
    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize - 1; x += 1) {
        if (state.horizontalLines[y][x] === null) {
          state = play(state, new Line('H', x, y));
          if (state.status !== GameStatus.InProgress) return state;
        }
      }
    }
    for (let y = 0; y < gridSize - 1; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        if (state.verticalLines[y][x] === null) {
          state = play(state, new Line('V', x, y));
          if (state.status !== GameStatus.InProgress) return state;
        }
      }
    }
    return state;
  };

  it('marks COMPLETED with deterministic scores once all boxes are claimed', () => {
    const state = playOutCompleteGame(3);
    expect(state.status).toBe(GameStatus.Completed);
    const expectedBoxes = totalBoxes(3);
    expect(state.boxes).toHaveLength(expectedBoxes);
    const totalScore = state.seats.reduce((a, s) => a + s.score, 0);
    expect(totalScore).toBe(expectedBoxes);
    expect(state.winnerSeatIndex !== null || state.draw).toBe(true);
  });

  it('rejects further moves after the game is completed', () => {
    const state = playOutCompleteGame(3);
    expect(state.status).toBe(GameStatus.Completed);
    expect(() =>
      GameEngine.applyMove(state, state.currentTurnSeatIndex, new Line('H', 0, 0)),
    ).toThrow(GameAlreadyEndedError);
  });
});

describe('GameEngine.abandon', () => {
  it('marks ABANDONED and sets winner to the surviving lead score', () => {
    let state = startGame(3);
    state = play(state, new Line('H', 0, 0));
    state = play(state, new Line('V', 0, 0));
    state = play(state, new Line('V', 1, 0));
    state = play(state, new Line('H', 0, 1));
    expect(state.seats[1].score).toBe(1);
    const ended = GameEngine.abandon(state, 0);
    expect(ended.status).toBe(GameStatus.Abandoned);
    expect(ended.winnerSeatIndex).toBe(1);
    expect(ended.draw).toBe(false);
  });

  it('declares the lone survivor winner — abandonment never invents a draw out of nothing', () => {
    const state = startGame(3);
    const ended = GameEngine.abandon(state, 0);
    expect(ended.status).toBe(GameStatus.Abandoned);
    expect(ended.winnerSeatIndex).toBe(1);
    expect(ended.draw).toBe(false);
  });

  it('flags a draw when multiple survivors are tied for the lead', () => {
    const state = GameEngine.initialise(
      GAME_ID,
      { ...DEFAULT_GAME_RULES, gridSize: 3, minPlayers: 2, maxPlayers: 4 },
      [seat(P1, 0, 'Alice'), seat(P2, 1, 'Bob'), seat(P3, 2, 'Carol')],
    );
    const ended = GameEngine.abandon(state, 0);
    expect(ended.status).toBe(GameStatus.Abandoned);
    expect(ended.winnerSeatIndex).toBeNull();
    expect(ended.draw).toBe(true);
  });
});

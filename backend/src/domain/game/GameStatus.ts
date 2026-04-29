export const GameStatus = {
  Waiting: 'waiting',
  InProgress: 'in_progress',
  Completed: 'completed',
  Abandoned: 'abandoned',
} as const;

export type GameStatusValue = (typeof GameStatus)[keyof typeof GameStatus];

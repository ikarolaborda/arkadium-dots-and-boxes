export const ProtocolErrorCode = {
  Unauthorized: 'UNAUTHORIZED',
  GameNotFound: 'GAME_NOT_FOUND',
  GameFull: 'GAME_FULL',
  GameNotJoinable: 'GAME_NOT_JOINABLE',
  NotYourTurn: 'NOT_YOUR_TURN',
  InvalidMove: 'INVALID_MOVE',
  LineAlreadyDrawn: 'LINE_ALREADY_DRAWN',
  LineOutOfBounds: 'LINE_OUT_OF_BOUNDS',
  GameAlreadyEnded: 'GAME_ALREADY_ENDED',
  Internal: 'INTERNAL',
} as const;

export type ProtocolErrorCodeName =
  (typeof ProtocolErrorCode)[keyof typeof ProtocolErrorCode];

export interface ProtocolError {
  readonly code: ProtocolErrorCodeName;
  readonly message: string;
}

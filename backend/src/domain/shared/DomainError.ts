import { ProtocolErrorCode, ProtocolErrorCodeName } from '@dab/shared';

export class DomainError extends Error {
  public readonly code: ProtocolErrorCodeName;

  constructor(code: ProtocolErrorCodeName, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export class GameNotFoundError extends DomainError {
  constructor(gameId: string) {
    super(ProtocolErrorCode.GameNotFound, `Game not found: ${gameId}`);
  }
}

export class GameFullError extends DomainError {
  constructor() {
    super(ProtocolErrorCode.GameFull, 'Game is full.');
  }
}

export class GameNotJoinableError extends DomainError {
  constructor(reason: string) {
    super(ProtocolErrorCode.GameNotJoinable, `Game not joinable: ${reason}`);
  }
}

export class NotYourTurnError extends DomainError {
  constructor() {
    super(ProtocolErrorCode.NotYourTurn, 'Not your turn.');
  }
}

export class InvalidMoveError extends DomainError {
  constructor(message: string) {
    super(ProtocolErrorCode.InvalidMove, message);
  }
}

export class LineAlreadyDrawnError extends DomainError {
  constructor() {
    super(ProtocolErrorCode.LineAlreadyDrawn, 'Line already drawn.');
  }
}

export class LineOutOfBoundsError extends DomainError {
  constructor() {
    super(ProtocolErrorCode.LineOutOfBounds, 'Line is out of bounds.');
  }
}

export class GameAlreadyEndedError extends DomainError {
  constructor() {
    super(ProtocolErrorCode.GameAlreadyEnded, 'Game has already ended.');
  }
}

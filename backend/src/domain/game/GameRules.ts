export interface GameRules {
  readonly gridSize: number;
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

export const DEFAULT_GAME_RULES: GameRules = Object.freeze({
  gridSize: 5,
  minPlayers: 2,
  maxPlayers: 4,
});

export const validateRules = (rules: GameRules): void => {
  if (rules.gridSize < 3 || rules.gridSize > 10) {
    throw new Error('gridSize must be between 3 and 10');
  }
  if (rules.minPlayers < 2 || rules.minPlayers > rules.maxPlayers) {
    throw new Error('invalid minPlayers/maxPlayers');
  }
  if (rules.maxPlayers > 8) {
    throw new Error('maxPlayers must be <= 8');
  }
};

/*
 * Wire protocol event names shared between backend gateway and frontend client.
 * Centralised so a rename is a one-line refactor that fails the type checker
 * on both sides simultaneously — the only acceptable migration path for a
 * client/server contract.
 */

export const ClientEvent = {
  JoinGame: 'game:join',
  LeaveGame: 'game:leave',
  PlayMove: 'game:move',
  Resume: 'game:resume',
} as const;

export type ClientEventName = (typeof ClientEvent)[keyof typeof ClientEvent];

export const ServerEvent = {
  StateSnapshot: 'game:state',
  StateDelta: 'game:delta',
  PlayerJoined: 'game:player_joined',
  PlayerLeft: 'game:player_left',
  PlayerDisconnected: 'game:player_disconnected',
  PlayerReconnected: 'game:player_reconnected',
  GameEnded: 'game:ended',
  Error: 'game:error',
} as const;

export type ServerEventName = (typeof ServerEvent)[keyof typeof ServerEvent];

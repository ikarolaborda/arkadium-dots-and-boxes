import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  GameStateDto,
  ProtocolError,
  StateDeltaDto,
} from '@dab/shared';
import { realtimeClient } from '@/services/RealtimeClient';
import { useSessionStore } from '@/stores/session';

export const useGameStore = defineStore('game', () => {
  const state = ref<GameStateDto | null>(null);
  const connected = ref<boolean>(false);
  const error = ref<string | null>(null);

  const session = useSessionStore();

  const me = computed(() =>
    state.value === null
      ? null
      : state.value.players.find((p) => p.id === session.playerId) ?? null,
  );

  const isMyTurn = computed(() =>
    state.value !== null &&
    me.value !== null &&
    state.value.currentTurnSeatIndex === me.value.seatIndex &&
    state.value.status === 'in_progress',
  );

  const ensureSocket = (): void => {
    if (session.token === null) {
      throw new Error('not authenticated');
    }
    realtimeClient.connect(session.token, {
      onConnectionChange: (c) => (connected.value = c),
      onSnapshot: (snap) => (state.value = snap),
      onDelta: (delta) => applyDelta(delta),
      onPlayerJoined: () => {
        /* server immediately sends a fresh snapshot afterwards. */
      },
      onPlayerDisconnected: ({ playerId }) =>
        markConnection(playerId, false),
      onPlayerReconnected: ({ playerId }) =>
        markConnection(playerId, true),
      onGameEnded: () => {
        /* state.status will be flipped by the next delta. */
      },
      onError: (err: ProtocolError) => {
        error.value = `${err.code}: ${err.message}`;
      },
    });
  };

  const joinGame = (gameId: string): void => {
    error.value = null;
    if (session.token === null) {
      error.value = 'not authenticated';
      return;
    }
    ensureSocket();
    realtimeClient.joinGame({ gameId, token: session.token });
  };

  const resumeGame = (gameId: string): void => {
    error.value = null;
    ensureSocket();
    realtimeClient.resume({ gameId });
  };

  const playMove = (orientation: 'H' | 'V', x: number, y: number): void => {
    if (state.value === null || session.playerId === null) {
      return;
    }
    realtimeClient.playMove({
      gameId: state.value.id,
      playerId: session.playerId,
      line: { orientation, x, y },
    });
  };

  const leave = (): void => {
    if (state.value === null) {
      return;
    }
    realtimeClient.leave({ gameId: state.value.id });
    state.value = null;
  };

  const reset = (): void => {
    realtimeClient.disconnect();
    state.value = null;
    connected.value = false;
    error.value = null;
  };

  const applyDelta = (delta: StateDeltaDto): void => {
    if (state.value === null || state.value.id !== delta.gameId) {
      return;
    }
    /*
     * Apply the delta to a deep copy. Pinia + Vue3 reactivity tracks
     * the new top-level reference so all renderers re-evaluate cleanly.
     * For high-frequency games we would diff in place, but for ~30
     * moves per match the overhead is invisible and this stays simple.
     */
    const cur = state.value;
    const horizontalLines = cur.horizontalLines.map((row) => [...row]);
    const verticalLines = cur.verticalLines.map((row) => [...row]);
    if (delta.line.orientation === 'H') {
      horizontalLines[delta.line.y][delta.line.x] = delta.bySeatIndex;
    } else {
      verticalLines[delta.line.y][delta.line.x] = delta.bySeatIndex;
    }
    const boxes = [...cur.boxes, ...delta.completedBoxes];
    const players = cur.players.map((p) =>
      p.seatIndex === delta.bySeatIndex
        ? { ...p, score: p.score + delta.completedBoxes.length }
        : p,
    );
    state.value = {
      ...cur,
      horizontalLines,
      verticalLines,
      boxes,
      players,
      moveCount: delta.sequence,
      currentTurnSeatIndex:
        delta.status === 'in_progress' ? delta.nextTurnSeatIndex : cur.currentTurnSeatIndex,
      status: delta.status,
      winnerSeatIndex: delta.winnerSeatIndex,
      draw: delta.draw,
    };
  };

  const markConnection = (playerId: string, isConnected: boolean): void => {
    if (state.value === null) {
      return;
    }
    state.value = {
      ...state.value,
      players: state.value.players.map((p) =>
        p.id === playerId ? { ...p, connected: isConnected } : p,
      ),
    };
  };

  return {
    state,
    connected,
    error,
    me,
    isMyTurn,
    joinGame,
    resumeGame,
    playMove,
    leave,
    reset,
  };
});

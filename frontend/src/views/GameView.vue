<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useGameStore } from '@/stores/game';
import { useSessionStore } from '@/stores/session';
import GameBoard from '@/components/GameBoard.vue';

const props = defineProps<{ id: string }>();
const game = useGameStore();
const session = useSessionStore();

const status = computed(() => game.state?.status ?? 'unknown');
const winnerName = computed(() => {
  const s = game.state;
  if (s === null) {
    return null;
  }
  return s.players.find((p) => p.seatIndex === s.winnerSeatIndex)?.nickname ?? null;
});

const onPlay = (orientation: 'H' | 'V', x: number, y: number): void => {
  game.playMove(orientation, x, y);
};

const start = (): void => {
  if (session.token === null) {
    return;
  }
  /*
   * If the local snapshot already matches the route id, prefer resume
   * (rejoin the room and refresh state) over join (which is rejected once
   * the game is in progress and the seat is already taken).
   */
  if (game.state !== null && game.state.id === props.id) {
    game.resumeGame(props.id);
    return;
  }
  game.joinGame(props.id);
};

onMounted(start);
watch(() => session.token, start);
/*
 * Re-init when the route param changes without a full remount. Vue Router
 * reuses the GameView component when navigating /games/A → /games/B, so
 * onMounted does not fire again. Without this watch the user would stay
 * subscribed to the previous game's room and receive the wrong state.
 */
watch(
  () => props.id,
  (next, prev) => {
    if (next === prev) {
      return;
    }
    game.leave();
    start();
  },
);
onBeforeUnmount(() => game.leave());
</script>

<template>
  <section>
    <div v-if="game.error" class="error">{{ game.error }}</div>
    <div v-if="game.state === null" class="muted">Connecting…</div>
    <template v-else>
      <div class="row" style="justify-content: space-between;">
        <h1 style="margin: 0;">Game {{ game.state.id.slice(0, 8) }}</h1>
        <span class="muted">
          {{ status }}{{ game.connected ? '' : ' · offline' }}
        </span>
      </div>

      <div class="card">
        <div class="players">
          <span
            v-for="p in game.state.players"
            :key="p.id"
            class="player-pill"
            :class="{ turn: p.seatIndex === game.state.currentTurnSeatIndex && status === 'in_progress', disconnected: !p.connected }"
          >
            {{ p.nickname }} — {{ p.score }}
          </span>
        </div>
      </div>

      <div class="card">
        <GameBoard :state="game.state" :can-play="game.isMyTurn" @play="onPlay" />
      </div>

      <div v-if="status === 'completed' || status === 'abandoned'" class="card">
        <h3 style="margin: 0 0 0.5rem 0;">Game over</h3>
        <p v-if="game.state.draw" class="muted">Draw — every player tied.</p>
        <p v-else>
          Winner:
          <strong>
            {{ winnerName ?? '—' }}
          </strong>
        </p>
        <p class="muted">{{ game.state.moveCount }} moves played.</p>
      </div>
    </template>
  </section>
</template>

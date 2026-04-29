<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { httpClient } from '@/services/HttpClient';

interface MatchSummary {
  id: string;
  gridSize: number;
  winnerSeatIndex: number | null;
  draw: boolean;
  moveCount: number;
  durationMs: number;
  completedAt: string;
  seats: Array<{ playerId: string; nickname: string; seatIndex: number; score: number }>;
}

const matches = ref<MatchSummary[]>([]);
const loading = ref<boolean>(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    matches.value = await httpClient.get<MatchSummary[]>('/games/history?limit=50');
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
});

const fmtDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
};
</script>

<template>
  <section>
    <h1>Match history</h1>
    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <ul v-else style="list-style: none; padding: 0;">
      <li v-for="m in matches" :key="m.id" class="card">
        <div class="row" style="justify-content: space-between;">
          <strong>{{ m.id.slice(0, 8) }}</strong>
          <span class="muted">{{ new Date(m.completedAt).toLocaleString() }}</span>
        </div>
        <div class="row wrap" style="margin-top: 0.5rem;">
          <span
            v-for="s in m.seats"
            :key="s.playerId"
            class="player-pill"
            :class="{ turn: s.seatIndex === m.winnerSeatIndex }"
          >
            {{ s.nickname }} — {{ s.score }}
          </span>
        </div>
        <p class="muted" style="margin: 0.5rem 0 0 0;">
          {{ m.gridSize }}x{{ m.gridSize }} · {{ m.moveCount }} moves · {{ fmtDuration(m.durationMs) }}
          <span v-if="m.draw"> · draw</span>
        </p>
      </li>
    </ul>
  </section>
</template>

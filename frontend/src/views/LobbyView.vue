<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { GameStateDto } from '@dab/shared';
import { httpClient } from '@/services/HttpClient';
import { useSessionStore } from '@/stores/session';

const router = useRouter();
const session = useSessionStore();
const games = ref<GameStateDto[]>([]);
const nicknameInput = ref<string>(session.nickname ?? '');
const gridSize = ref<number>(5);
const error = ref<string | null>(null);

const refresh = async (): Promise<void> => {
  try {
    games.value = await httpClient.get<GameStateDto[]>('/games/joinable');
  } catch (e) {
    error.value = (e as Error).message;
  }
};

onMounted(refresh);

const ensureSession = async (): Promise<boolean> => {
  if (session.token !== null) {
    return true;
  }
  if (nicknameInput.value.trim().length === 0) {
    error.value = 'pick a nickname first';
    return false;
  }
  await session.login(nicknameInput.value.trim());
  return true;
};

const create = async (): Promise<void> => {
  error.value = null;
  if (!(await ensureSession())) {
    return;
  }
  try {
    const game = await httpClient.post<GameStateDto>(
      '/games',
      { nickname: session.nickname, gridSize: gridSize.value },
      session.token ?? undefined,
    );
    await router.push({ name: 'game', params: { id: game.id } });
  } catch (e) {
    error.value = (e as Error).message;
  }
};

const join = async (id: string): Promise<void> => {
  error.value = null;
  if (!(await ensureSession())) {
    return;
  }
  await router.push({ name: 'game', params: { id } });
};
</script>

<template>
  <section>
    <h1>Lobby</h1>
    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <h2 style="margin-top: 0;">Create a new game</h2>
      <div class="row wrap">
        <input
          v-if="session.nickname === null"
          v-model="nicknameInput"
          placeholder="Nickname"
          maxlength="40"
        />
        <label class="muted">Grid:</label>
        <input
          v-model.number="gridSize"
          type="number"
          min="3"
          max="10"
          style="width: 5rem;"
        />
        <button type="button" @click="create">Create game</button>
      </div>
    </div>

    <div class="card">
      <div class="row" style="justify-content: space-between;">
        <h2 style="margin: 0;">Joinable games</h2>
        <button type="button" @click="refresh">Refresh</button>
      </div>
      <p v-if="games.length === 0" class="muted">No games waiting. Be the first to create one.</p>
      <ul style="list-style: none; padding: 0;">
        <li v-for="g in games" :key="g.id" class="row" style="justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--line);">
          <span>
            <strong>{{ g.players[0]?.nickname ?? 'host' }}</strong>
            <span class="muted"> · {{ g.gridSize }}x{{ g.gridSize }} · {{ g.players.length }} player(s)</span>
          </span>
          <button type="button" @click="join(g.id)">Join</button>
        </li>
      </ul>
    </div>
  </section>
</template>

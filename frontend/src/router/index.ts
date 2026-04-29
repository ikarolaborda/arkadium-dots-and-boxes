import { createRouter, createWebHistory } from 'vue-router';
import LobbyView from '@/views/LobbyView.vue';
import GameView from '@/views/GameView.vue';
import HistoryView from '@/views/HistoryView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'lobby', component: LobbyView },
    { path: '/games/:id', name: 'game', component: GameView, props: true },
    { path: '/history', name: 'history', component: HistoryView },
  ],
});

import { defineStore } from 'pinia';
import { ref } from 'vue';
import { httpClient } from '@/services/HttpClient';

interface SessionResponse {
  token: string;
  playerId: string;
  nickname: string;
}

const STORAGE_KEY = 'dab.session';

const restore = (): SessionResponse | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : (JSON.parse(raw) as SessionResponse);
  } catch {
    return null;
  }
};

export const useSessionStore = defineStore('session', () => {
  const initial = restore();
  const token = ref<string | null>(initial?.token ?? null);
  const playerId = ref<string | null>(initial?.playerId ?? null);
  const nickname = ref<string | null>(initial?.nickname ?? null);

  const login = async (chosenNickname: string): Promise<void> => {
    const res = await httpClient.post<SessionResponse>('/sessions', {
      nickname: chosenNickname,
    });
    token.value = res.token;
    playerId.value = res.playerId;
    nickname.value = res.nickname;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
  };

  const logout = (): void => {
    token.value = null;
    playerId.value = null;
    nickname.value = null;
    localStorage.removeItem(STORAGE_KEY);
  };

  return { token, playerId, nickname, login, logout };
});

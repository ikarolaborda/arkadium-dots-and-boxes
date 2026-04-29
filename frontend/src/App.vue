<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
import { useSessionStore } from '@/stores/session';

const session = useSessionStore();
</script>

<template>
  <div class="container">
    <header class="row" style="justify-content: space-between; margin-bottom: 1.5rem;">
      <RouterLink to="/" style="font-size: 1.4rem; font-weight: 700; color: var(--fg);">
        Dots and Boxes
      </RouterLink>
      <nav class="row">
        <RouterLink to="/history">Match history</RouterLink>
        <span v-if="session.nickname !== null" class="muted">
          {{ session.nickname }}
          <button
            type="button"
            style="background: transparent; color: var(--muted); padding: 0; font-weight: 400;"
            @click="session.logout()"
          >(sign out)</button>
        </span>
      </nav>
    </header>
    <RouterView />
  </div>
</template>

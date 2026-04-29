<script setup lang="ts">
import { computed } from 'vue';
import { GameStateDto } from '@dab/shared';

const props = defineProps<{
  state: GameStateDto;
  canPlay: boolean;
}>();

const emit = defineEmits<{
  (e: 'play', orientation: 'H' | 'V', x: number, y: number): void;
}>();

const cell = 64;
const dot = 6;

const seatColor = (seatIndex: number | null): string => {
  if (seatIndex === null || seatIndex < 0) {
    return 'var(--line)';
  }
  const palette = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)'];
  return palette[seatIndex % palette.length];
};

const totalSize = computed(() => (props.state.gridSize - 1) * cell);

const dots = computed(() => {
  const result: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < props.state.gridSize; y += 1) {
    for (let x = 0; x < props.state.gridSize; x += 1) {
      result.push({ x, y });
    }
  }
  return result;
});

const playLine = (orientation: 'H' | 'V', x: number, y: number): void => {
  if (!props.canPlay) {
    return;
  }
  const drawn =
    orientation === 'H'
      ? props.state.horizontalLines[y][x]
      : props.state.verticalLines[y][x];
  if (drawn !== null) {
    return;
  }
  emit('play', orientation, x, y);
};
</script>

<template>
  <svg
    role="img"
    :width="totalSize + 32"
    :height="totalSize + 32"
    :viewBox="`-16 -16 ${totalSize + 32} ${totalSize + 32}`"
    style="background: #0b0f14; border-radius: 12px; max-width: 100%;"
  >
    <g>
      <rect
        v-for="box in state.boxes"
        :key="`b-${box.x}-${box.y}`"
        :x="box.x * cell + 4"
        :y="box.y * cell + 4"
        :width="cell - 8"
        :height="cell - 8"
        :fill="seatColor(box.ownerSeatIndex)"
        opacity="0.25"
        rx="3"
      />
    </g>
    <g>
      <template v-for="(row, y) in state.horizontalLines" :key="`hr-${y}`">
        <line
          v-for="(seatIdx, x) in row"
          :key="`h-${x}-${y}`"
          :x1="x * cell + dot"
          :y1="y * cell"
          :x2="(x + 1) * cell - dot"
          :y2="y * cell"
          :stroke="seatIdx === null ? 'var(--line)' : seatColor(seatIdx)"
          :stroke-width="seatIdx === null ? 2 : 4"
          :stroke-dasharray="seatIdx === null ? '4 4' : '0'"
          :style="{ cursor: canPlay && seatIdx === null ? 'pointer' : 'default' }"
          @click="playLine('H', x, y)"
        />
      </template>
    </g>
    <g>
      <template v-for="(row, y) in state.verticalLines" :key="`vr-${y}`">
        <line
          v-for="(seatIdx, x) in row"
          :key="`v-${x}-${y}`"
          :x1="x * cell"
          :y1="y * cell + dot"
          :x2="x * cell"
          :y2="(y + 1) * cell - dot"
          :stroke="seatIdx === null ? 'var(--line)' : seatColor(seatIdx)"
          :stroke-width="seatIdx === null ? 2 : 4"
          :stroke-dasharray="seatIdx === null ? '4 4' : '0'"
          :style="{ cursor: canPlay && seatIdx === null ? 'pointer' : 'default' }"
          @click="playLine('V', x, y)"
        />
      </template>
    </g>
    <g>
      <circle
        v-for="d in dots"
        :key="`d-${d.x}-${d.y}`"
        :cx="d.x * cell"
        :cy="d.y * cell"
        :r="dot"
        fill="var(--fg)"
      />
    </g>
  </svg>
</template>

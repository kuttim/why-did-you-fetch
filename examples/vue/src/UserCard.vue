<script setup lang="ts">
import { ref, watch } from 'vue';

interface User {
  name: string;
}

const props = defineProps<{ id: number }>();
const user = ref<User | null>(null);

watch(
  () => props.id,
  (id) => {
    user.value = null;
    fetch(`https://jsonplaceholder.typicode.com/users/${id}`)
      .then((r) => r.json())
      .then((data) => (user.value = data));
  },
  { immediate: true },
);
</script>

<template>
  <div style="border: 1px solid #ccc; border-radius: 6px; padding: 0.75rem 1rem">
    <strong>UserCard:</strong> {{ user?.name ?? 'Loading…' }}
  </div>
</template>

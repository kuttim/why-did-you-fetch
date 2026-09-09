<script setup lang="ts">
import { ref } from 'vue';
import UserCard from './UserCard.vue';
import Avatar from './Avatar.vue';

const userId = ref(1);
</script>

<template>
  <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 3rem auto; line-height: 1.6">
    <h1>why-did-you-fetch — Vue example</h1>
    <p>
      Open devtools' console. <code>UserCard</code> and <code>Avatar</code> below each independently fetch the same user
      on mount — you should see a <code>duplicate-inflight</code> warning as soon as the page loads.
    </p>
    <button @click="userId++">Load a different user (id: {{ userId }})</button>
    <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem">
      <UserCard :id="userId" />
      <Avatar :id="userId" />
    </div>
  </div>
</template>

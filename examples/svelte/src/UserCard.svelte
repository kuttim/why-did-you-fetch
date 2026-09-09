<script lang="ts">
  interface User {
    name: string;
  }

  let { id }: { id: number } = $props();
  let user = $state<User | null>(null);

  $effect(() => {
    user = null;
    fetch(`https://jsonplaceholder.typicode.com/users/${id}`)
      .then((r) => r.json())
      .then((data) => (user = data));
  });
</script>

<div style="border: 1px solid #ccc; border-radius: 6px; padding: 0.75rem 1rem">
  <strong>UserCard:</strong> {user?.name ?? 'Loading…'}
</div>

<script lang="ts">
  interface User {
    name: string;
  }

  let { id }: { id: number } = $props();
  let user = $state<User | null>(null);

  $effect(() => {
    user = null;
    // Same endpoint as UserCard — fetched independently. Neither component knows the other
    // is fetching the same user at the same time.
    fetch(`https://jsonplaceholder.typicode.com/users/${id}`)
      .then((r) => r.json())
      .then((data) => (user = data));
  });
</script>

<div style="border: 1px solid #ccc; border-radius: 6px; padding: 0.75rem 1rem">
  <strong>Avatar:</strong> {user?.name ?? 'Loading…'}
</div>

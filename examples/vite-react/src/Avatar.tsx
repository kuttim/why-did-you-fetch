import { useEffect, useState } from 'react';

interface User {
  name: string;
}

export function Avatar({ id }: { id: number }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(null);
    // Same endpoint as UserCard — fetched independently. Neither component knows the other
    // is fetching the same user at the same time.
    fetch(`https://jsonplaceholder.typicode.com/users/${id}`)
      .then((r) => r.json())
      .then(setUser);
  }, [id]);

  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 6, padding: '0.75rem 1rem' }}>
      <strong>Avatar:</strong> {user?.name ?? 'Loading…'}
    </div>
  );
}

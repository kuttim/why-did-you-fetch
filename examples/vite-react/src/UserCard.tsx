import { useEffect, useState } from 'react';

interface User {
  name: string;
}

export function UserCard({ id }: { id: number }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUser(null);
    fetch(`https://jsonplaceholder.typicode.com/users/${id}`)
      .then((r) => r.json())
      .then(setUser);
  }, [id]);

  return (
    <div style={{ border: '1px solid #ccc', borderRadius: 6, padding: '0.75rem 1rem' }}>
      <strong>UserCard:</strong> {user?.name ?? 'Loading…'}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { UserCard } from './UserCard';
import { Avatar } from './Avatar';

export function Demo() {
  const [userId, setUserId] = useState(1);

  return (
    <>
      <button onClick={() => setUserId((id) => id + 1)}>Load a different user (id: {userId})</button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
        <UserCard id={userId} />
        <Avatar id={userId} />
      </div>
    </>
  );
}

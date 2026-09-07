import { useState } from 'react';
import { UserCard } from './UserCard';
import { Avatar } from './Avatar';

export function App() {
  const [userId, setUserId] = useState(1);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '3rem auto', lineHeight: 1.6 }}>
      <h1>why-did-you-fetch — Vite + React example</h1>
      <p>
        Open devtools&rsquo; console. <code>UserCard</code> and <code>Avatar</code> below each independently fetch the
        same user on mount — you should see a <code>duplicate-inflight</code> warning as soon as the page loads.
      </p>
      <p>
        <em>
          Running under <code>&lt;StrictMode&gt;</code> (the Vite default) double-invokes effects in dev, so you may see
          more than one warning per load — each one is a real redundant fetch StrictMode's extra pass caused, not a bug
          in this example.
        </em>
      </p>
      <button onClick={() => setUserId((id) => id + 1)}>Load a different user (id: {userId})</button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
        <UserCard id={userId} />
        <Avatar id={userId} />
      </div>
    </div>
  );
}

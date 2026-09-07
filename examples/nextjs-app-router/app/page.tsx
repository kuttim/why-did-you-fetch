import { Demo } from './Demo';

export default function Page() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '3rem auto', lineHeight: 1.6 }}>
      <h1>why-did-you-fetch — Next.js App Router example</h1>
      <p>
        Open devtools&rsquo; console. <code>UserCard</code> and <code>Avatar</code> are client components that each
        independently fetch the same user on mount — you should see a <code>duplicate-inflight</code> warning as soon as
        the page loads.
      </p>
      <Demo />
    </main>
  );
}

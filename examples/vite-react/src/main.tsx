import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { init } from 'why-did-you-fetch';
import { App } from './App';

// Called here, at the true entry point, before React renders anything — not via the
// useWhyDidYouFetch() hook inside App. React fires effects children-before-parents, so a hook
// call inside App would only install the patch *after* App's own children (UserCard, Avatar)
// had already fired their first-mount fetches, missing exactly the case this library exists to
// catch. Calling init() here catches every fetch from the very first paint onward. See the
// main README's "Notes and caveats" for the full explanation, and why the hook is still the
// right call when you don't control the entry point (a component library, Next.js — see
// ../nextjs-app-router).
init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

'use client';

import { useWhyDidYouFetch } from 'why-did-you-fetch/react';

/**
 * Installs why-did-you-fetch on the client only.
 *
 * Next.js's App Router runs Server Components (and even Client Component code, during the
 * initial SSR pass) on the server, where `fetch` is already patched by Next.js itself for its
 * own caching/revalidation layer. `useWhyDidYouFetch()` installs inside a `useEffect`, which
 * React never runs during server rendering — only client fetches ever get patched, so there's
 * no interaction with Next's server-side fetch handling.
 *
 * This is rendered as an early sibling of `{children}` in the root layout (not a parent wrapping
 * them) — React fires passive effects in document order for siblings, so this component's effect
 * (it has no children of its own) completes before the page's fetching components mount. If you
 * instead render fetching components as *descendants* of a component that calls this hook, their
 * first-mount fetches can slip through before the patch is installed — see the main README's
 * "Notes and caveats" and ../vite-react for the entry-point alternative to this hook.
 */
export function WhyDidYouFetchInit() {
  useWhyDidYouFetch();
  return null;
}

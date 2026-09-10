import { useEffect, useRef } from 'react';
import { init } from './index';
import type { WdyfOptions } from './index';

/**
 * Thin React convenience wrapper around `init()`. Call it once, near the root of your app —
 * it installs the fetch/XHR patch on mount and restores the originals on unmount:
 *
 * ```tsx
 * import { useWhyDidYouFetch } from 'why-did-you-fetch/react';
 *
 * function App() {
 *   useWhyDidYouFetch();
 *   return <YourApp />;
 * }
 * ```
 *
 * `options` are captured once, at mount time — passing a new object literal on every render
 * won't reinstall the patch, so it's safe (and expected) to pass one inline.
 *
 * Installs in a `useEffect`, which only ever runs on the client (never during SSR) — but React
 * fires effects children-before-parents, so if this is called in a root/layout component, any
 * fetches *this component's own descendants* make during that very first mount happen before
 * the effect above has installed the patch, and won't be caught. Everything after that point
 * (re-renders, remounts, StrictMode's second pass) is caught normally. For guaranteed first-paint
 * coverage in an app you fully control the entry point of, call `init()` directly there instead,
 * before rendering — see `examples/vite-react`. This hook is still the right call when you don't
 * control the entry point (e.g. Next.js — see `examples/nextjs-app-router`).
 */
export function useWhyDidYouFetch(options?: WdyfOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    // Intentionally mount-once: options are read from the ref above, not this dependency array.
    const uninstall = init(optionsRef.current);
    return uninstall;
  }, []);
}

export type { WdyfOptions } from './index';

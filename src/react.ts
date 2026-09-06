import { useEffect, useRef } from 'react';
import { init } from './index.js';
import type { WdyfOptions } from './index.js';

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

export type { WdyfOptions } from './index.js';

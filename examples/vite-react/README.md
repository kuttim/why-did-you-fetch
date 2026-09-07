# Vite + React example

A minimal real Vite project (`npm create vite`-shaped).

## Run it

```sh
npm install
npm run dev
```

Open the printed URL and open your browser console — `UserCard` and `Avatar` each independently
fetch the same user on mount, so a `duplicate-inflight` warning should show up as soon as the
page loads (StrictMode's double-invoked effects mean you may see more than one — each is a real
redundant fetch, not a bug in this example).

## Why `init()` lives in `main.tsx`, not the `useWhyDidYouFetch()` hook

This example calls `init()` directly at the top of `main.tsx`, before React renders anything,
rather than using the `why-did-you-fetch/react` hook inside `App`. React fires effects
children-before-parents, so a hook call in `App` would only install the patch _after_ `App`'s own
children (`UserCard`, `Avatar`) had already fired their first-mount fetches — missing exactly the
case this library exists to catch. Calling `init()` at the true entry point sidesteps that
entirely. See the main README's ["Notes and caveats"](../../README.md#notes-and-caveats) for the
full explanation, and [`examples/nextjs-app-router`](../nextjs-app-router) for a case where you
don't control the entry point and the hook is the right call instead.

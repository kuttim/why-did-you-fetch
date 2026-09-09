# Vue example

A minimal real Vite + Vue 3 project (`npm create vue`-shaped, `<script setup>` SFCs).

## Run it

```sh
npm install
npm run dev
```

Open the printed URL and open your browser console — `UserCard` and `Avatar` each independently
fetch the same user on mount, so a `duplicate-inflight` warning should show up as soon as the
page loads, with the call stacks pointing straight at `UserCard.vue` and `Avatar.vue`.

## Why `init()` lives in `main.ts`

Like [`examples/vite-react`](../vite-react), this example calls `init()` directly at the top of
`main.ts`, before Vue mounts anything, rather than wrapping it in a composable used inside a
component's own lifecycle hook. Installing it at the true entry point guarantees it's active
before _any_ component gets a chance to mount — the general version of the pattern that
`examples/vite-react`'s README explains in more framework-specific detail for React (where
installing inside a parent component's `useEffect` instead would actually miss requests, because
of how React orders effects). Vue's `watch(..., { immediate: true })` here doesn't have that
specific ordering hazard, but calling `init()` at the entry point is still the simplest way to get
guaranteed first-paint coverage regardless.

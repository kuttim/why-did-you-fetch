# Svelte example

A minimal real Vite + Svelte 5 project (`npm create vite -- --template svelte-ts`-shaped, runes).

## Run it

```sh
npm install
npm run dev
```

Open the printed URL and open your browser console — `UserCard` and `Avatar` each independently
fetch the same user on mount, so a `duplicate-inflight` warning should show up as soon as the
page loads, with the call stacks pointing straight at `UserCard.svelte` and `Avatar.svelte`.

## Why `init()` lives in `main.ts`

Like [`examples/vite-react`](../vite-react), this example calls `init()` directly at the top of
`main.ts`, before Svelte mounts anything, rather than calling it from inside a component's own
`$effect`. Installing it at the true entry point guarantees it's active before _any_ component
gets a chance to mount — see that example's README for the more framework-specific version of
this reasoning (React's effect ordering, specifically).

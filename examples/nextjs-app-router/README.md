# Next.js App Router example

A minimal real Next.js (App Router) project.

## Run it

```sh
npm install
npm run dev
```

Open the printed URL and open your browser console — `UserCard` and `Avatar` each independently
fetch the same user on mount, so a `duplicate-inflight` warning should show up as soon as the
page loads.

## Why this uses the `useWhyDidYouFetch()` hook, not a direct `init()` call

Unlike [`examples/vite-react`](../vite-react), this example uses the
`why-did-you-fetch/react` hook (in [`app/wdyf-init.tsx`](./app/wdyf-init.tsx)) instead of calling
`init()` directly at a module's top level. The reason is SSR: the App Router renders Client
Component code on the server too, during the initial render — a bare `init()` call at module
scope would run there too, patching the _server's_ global `fetch`, which Next.js already patches
itself for its own caching/revalidation. The hook installs inside a `useEffect`, which React never
runs during server rendering, so it only ever touches the client.

`WhyDidYouFetchInit` is rendered as an **early sibling** of the page content in
[`app/layout.tsx`](./app/layout.tsx) — not a parent wrapping it. React fires passive effects in
document order for siblings, so this component's effect (it renders nothing, has no children)
completes before `UserCard`/`Avatar`'s effects run. If `WhyDidYouFetchInit`'s hook call were
instead in a component that's an _ancestor_ of the fetching components, their first-mount fetches
could fire before the patch is installed — see the main README's
["Notes and caveats"](../../README.md#notes-and-caveats).

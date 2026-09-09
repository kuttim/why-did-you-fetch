# Examples

Real, runnable integrations — not just snippets. Each one is a minimal, independent project you
can `cd` into and actually run.

| Example                                    | What it shows                                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`vanilla`](./vanilla)                     | Zero install, zero build step — a single HTML file.                                                                                       |
| [`vite-react`](./vite-react)               | A real Vite project, `init()` called at the entry point for guaranteed first-paint coverage.                                              |
| [`nextjs-app-router`](./nextjs-app-router) | A real Next.js App Router project, `useWhyDidYouFetch()` in a client-only sibling component — the pattern that's actually safe under SSR. |
| [`vue`](./vue)                             | A real Vite + Vue 3 project (`<script setup>`, runes-adjacent composition), `init()` at the entry point.                                  |
| [`angular`](./angular)                     | A real Angular project, standalone components — `HttpClient`'s default XHR backend is caught the same way as raw XHR.                     |
| [`svelte`](./svelte)                       | A real Vite + Svelte 5 project (runes), `init()` at the entry point.                                                                      |

Every example except `vanilla` depends on the real published `why-did-you-fetch` package (not the
local source in `../src`), and CI builds all of them on every push — they're kept honest, not
just written once and left to rot.

These frameworks were picked deliberately: bundler/framework interop is the single most common
category of real-world integration issue for a library like this (patching a global that a
framework's own dev server, SSR layer, or fetch caching might also touch), so these examples
exist specifically to catch and document that class of problem before it becomes a GitHub issue.

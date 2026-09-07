# why-did-you-fetch

[![npm version](https://img.shields.io/npm/v/why-did-you-fetch.svg)](https://www.npmjs.com/package/why-did-you-fetch)
[![CI](https://github.com/kuttim/why-did-you-fetch/actions/workflows/ci.yml/badge.svg)](https://github.com/kuttim/why-did-you-fetch/actions/workflows/ci.yml)
[![types](https://img.shields.io/npm/types/why-did-you-fetch.svg)](./src/types.ts)
[![npm downloads](https://img.shields.io/npm/dm/why-did-you-fetch.svg)](https://www.npmjs.com/package/why-did-you-fetch)
[![license](https://img.shields.io/npm/l/why-did-you-fetch.svg)](./LICENSE)

Monkey-patches `fetch` and `XMLHttpRequest` to warn you, in development, about network calls
your app almost certainly didn't mean to make: **duplicate requests fired while an identical one
is already in flight, identical requests repeated moments after the last one finished, and runs
of requests fired one-after-another that could have been fired together.**

It's the same idea as [`why-did-you-render`][wdyr] — instrument something ubiquitous, stay
silent until there's something worth flagging, then print a clear, actionable console message
with the call site — applied to the network tab instead of the render tree.

**[Try the live demo →](https://kuttim.github.io/why-did-you-fetch/)**
No install required — it runs the real published package in your browser against a mock network
layer, with sample-project code for each detected pattern.

![The live demo's network and console panels, showing a real duplicate-in-flight warning for two GET requests to /api/users/42 fired 462ms apart with no gap, and the matching console message: "Duplicate in-flight request: GET /api/users/42 was requested again before the first call finished."](./.github/readme/console-output.png)

*Real output from the [live demo](https://kuttim.github.io/why-did-you-fetch/) — the left panel
is the demo's simulated network view, the right panel mirrors what actually prints to your
browser's real console.*

## Why

Two components independently `fetch`ing the same resource, a `useEffect` firing twice under
StrictMode-like conditions, or three independent lookups awaited one at a time instead of via
`Promise.all` — none of these throw, none of them show up in a type error, and all of them are
easy to miss in a network tab with a hundred other requests in it. This library watches every
`fetch`/`XHR` call as it happens and tells you the moment one of these patterns shows up.

## Install

```sh
npm install --save-dev why-did-you-fetch
```

Requires Node.js ≥22 to install and build this package (that's about the toolchain, not about
where the published code can run — see [Compatibility](#compatibility) for that).

## Quick start

Call `init()` once, as early as possible in your app (entry point, root layout, etc.):

```ts
import { init } from 'why-did-you-fetch';

init();
```

By default it's a no-op when `process.env.NODE_ENV === 'production'`, so it's safe to leave the
call in unconditionally. It patches both `fetch` and `XMLHttpRequest`, and reports issues to the
console. That covers `axios` and most other HTTP clients **in the browser**, where they sit on
top of XHR (or fetch) — see [Compatibility](#compatibility) for the Node.js caveat.

Call the function `init()` returns to restore the originals (useful in tests, or with HMR):

```ts
const uninstall = init();
// ...
uninstall();
```

### React

A thin convenience hook is available at `why-did-you-fetch/react` — it calls `init()` on mount
and the returned `uninstall()` on unmount, so you don't have to manage that yourself:

```tsx
import { useWhyDidYouFetch } from 'why-did-you-fetch/react';

function App() {
  useWhyDidYouFetch(); // same options as init(); read once, at mount time
  return <YourApp />;
}
```

`react` is an optional peer dependency — only needed if you import this entry point.

## What it detects

| Detector | Fires when | Confidence |
| --- | --- | --- |
| `duplicate-inflight` | The exact same request (method + URL + body) is issued again before the first call has settled. | High — this is almost always accidental. |
| `duplicate-recent` | The exact same request is issued again shortly (default 2s) after an identical call already finished. | High, but tune `dedupeWindowMs` for endpoints that are meant to be polled. |
| `sequential-chain` | Several requests (default 3+) fire back-to-back with almost no gap between one settling and the next starting. | **Heuristic.** This flags the *pattern* of serialization, not a proven dependency problem — it's a prompt to go check whether `Promise.all` would work, not a claim that it definitely would. |

Each issue is delivered with the call stack(s) involved, so you can jump straight to the
offending code — the default console reporter prints them as a collapsed, color-coded group.

## Compatibility

`init()` patches whatever exists on the target object (`globalThis` by default). Where either
API is missing, that half of the patch is silently skipped — calling `init()` is always safe, it
just won't catch anything in an environment with neither.

| Environment | `fetch` | `XMLHttpRequest` |
| --- | --- | --- |
| Any browser (React, Vue, Svelte, Angular, vanilla) | ✅ | ✅ |
| React Native | ✅ | ✅ |
| Electron — renderer process | ✅ | ✅ |
| Electron — main process | ✅ (Node ≥18) | ❌ |
| Dedicated Web Worker | ✅ | ✅ |
| Service Worker | ✅ | ❌ |
| Node.js ≥18 | ✅ (native, via `undici`) | ❌ (never implemented) |
| Node.js <18 | ❌ (unless polyfilled) | ❌ |
| Deno | ✅ | ❌ |
| Bun | ✅ | ❌ |

A couple of specifics worth calling out:

- **Node.js has no `XMLHttpRequest`, ever** — it's a browser/DOM API. On a Node server, only the
  `fetch` half of `init()` does anything.
- **`axios` on the server bypasses both.** Its default Node.js adapter (`'http'`) talks to
  `node:http`/`node:https` directly; the browser default (`'xhr'`) sits on top of the API this
  library patches. So `axios` calls are caught in the browser, not in a Node backend — same story
  for most other Node-native HTTP clients (`got`, `superagent`, etc.).
- **Service Workers get `fetch` but not `XMLHttpRequest`** — it's excluded from
  `ServiceWorkerGlobalScope` by spec, unlike regular (dedicated) Web Workers, which do have it.

## Configuration

```ts
init({
  enabled: process.env.NODE_ENV !== 'production', // default
  patch: ['fetch', 'xhr'],                          // default: both
  dedupeWindowMs: 2000,                             // "recent duplicate" window
  chainGapMs: 10,                                   // max gap between settle -> next start to count as "back-to-back"
  chainMinLength: 3,                                // how many chained requests before it's reported
  retainMs: 5000,                                   // how long settled requests are remembered for comparison
  ignore: [
    '/analytics',                                    // substring match
    /\/health-?check/i,                              // RegExp match
    (url, method) => method === 'GET' && url.endsWith('.png'), // custom predicate
  ],
  normalizeUrl: (url) => url.replace(/([?&])_=\d+/, ''), // strip cache-busting params before matching
  onIssue: (issue) => {
    // Fully replaces the console reporter — ship issues wherever you like.
    myLogger.warn(issue.message, issue);
  },
});
```

See [`src/types.ts`](./src/types.ts) for the full `Issue` union and every option's doc comment.

## Notes and caveats

- **This is a development tool.** It adds bookkeeping overhead to every network call; leave
  `enabled` at its default so it's compiled out of / skipped in production.
- **Data-fetching libraries that already dedupe** (React Query, SWR, Apollo, RTK Query, ...)
  won't produce `duplicate-*` warnings for the requests they manage themselves, since they don't
  re-issue an in-flight request in the first place — that's the point of using them. This
  library is most useful for raw `fetch`/`axios` usage, or for finding the requests that slip
  outside those libraries' cache keys.
- **The chain detector is intentionally conservative and intentionally honest about being a
  heuristic.** It cannot know whether request B actually needs request A's result — it only
  reports the observable pattern of "these fired one after another with basically no gap." Use
  your judgment before reaching for `Promise.all`.
- **Request bodies from a `Request` object** (as opposed to `init.body`) aren't fingerprinted,
  since reading them would mean consuming the stream before the real `fetch` gets to it — those
  calls are still tracked and matched by method + URL alone.

## Example

**[Live demo](https://kuttim.github.io/why-did-you-fetch/)** — no install required, runs in your
browser against a mock network layer, with sample-project code for each detected pattern
([source](./docs/index.html)).

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT © contributors

[wdyr]: https://github.com/welldone-software/why-did-you-render

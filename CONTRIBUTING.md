# Contributing

Thanks for considering a contribution!

## Setup

```sh
npm install
npm run test:watch   # tests
npm run lint
npm run typecheck
npm run build
```

## Guidelines

- Keep the runtime dependency-free — this library patches globals that run on every request in
  a user's app, so it stays deliberately small.
- New detectors should err on the side of **fewer, more confident warnings**. A tool like this
  earns trust by never crying wolf; a false positive is worse than a missed real one.
- Add tests for new detector logic in `tests/tracker.test.ts` (unit-level, using the injectable
  clock) and, if it touches `patchFetch`/`patchXHR`, an integration test alongside the existing
  ones.
- Run `npm run prepublishOnly` before opening a PR — it's the same check CI runs.

## Reporting a bug

Please include: the request pattern that triggered (or should have triggered) a warning, your
`init()` options, and whether you're on `fetch`, `XMLHttpRequest`, or a library on top of either.

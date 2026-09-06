# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.3.0] - 2026-09-06

### Changed

- Add verified compatibility table, fix engines and CI matrix

## [0.2.1] - 2026-09-06

### Added

- Add one-command release script

## [0.2.0] - 2026-09-06

### Added

- Interactive live demo, hosted from the repo via GitHub Pages at
  [kuttim.github.io/why-did-you-fetch](https://kuttim.github.io/why-did-you-fetch/)
  (source: [`docs/index.html`](./docs/index.html)) and linked from the README. Runs the real
  published package in the browser against a mock network layer, with sample-project code
  shown for each detected pattern — no install required to try it.

## [0.1.0] - 2026-09-06

### Added

- Initial release: `init()` patches `fetch` and `XMLHttpRequest`.
- Three detectors: `duplicate-inflight`, `duplicate-recent`, `sequential-chain`.
- Configurable dedupe window, chain gap/length, ignore list, URL normalization, and a
  pluggable `onIssue` reporter (defaults to a colored console reporter).
- `why-did-you-fetch/react` entry point with a `useWhyDidYouFetch()` hook (`react` is an
  optional peer dependency).

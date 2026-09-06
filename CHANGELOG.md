# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - Unreleased

### Added

- Initial release: `init()` patches `fetch` and `XMLHttpRequest`.
- Three detectors: `duplicate-inflight`, `duplicate-recent`, `sequential-chain`.
- Configurable dedupe window, chain gap/length, ignore list, URL normalization, and a
  pluggable `onIssue` reporter (defaults to a colored console reporter).

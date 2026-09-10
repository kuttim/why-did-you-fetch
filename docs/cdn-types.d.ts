// The demo imports the real published package from jsDelivr's unversioned URL at runtime (always
// the latest release) — browsers resolve that fine, but tsc has no way to fetch/resolve an
// arbitrary HTTPS module specifier. This tells it to type-check that import against our own local
// source instead, which is exactly what the CDN URL actually serves.
declare module 'https://cdn.jsdelivr.net/npm/why-did-you-fetch/dist/index.js' {
  export { init, consoleReporter } from '../src/index.js';
  export type { Issue, WdyfOptions } from '../src/index.js';
}

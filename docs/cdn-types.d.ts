// The demo imports the real published package from a version-pinned jsDelivr URL at runtime —
// browsers resolve that fine, but tsc has no way to fetch/resolve an arbitrary HTTPS module
// specifier. This tells it to type-check that import against our own local source instead,
// which is exactly what the CDN URL actually serves once published. The wildcard means it
// keeps working across every version bump without needing to be updated in lockstep.
declare module 'https://cdn.jsdelivr.net/npm/why-did-you-fetch@*/dist/index.js' {
  export { init } from '../src/index.js';
  export type { Issue, WdyfOptions } from '../src/index.js';
}

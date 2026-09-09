# Angular example

A minimal real Angular project (`ng new`-shaped, standalone components, signal-based inputs).

## Run it

```sh
npm install
npm start
```

Open the printed URL and open your browser console — `UserCard` and `Avatar` each independently
fetch the same user on mount, so a `duplicate-inflight` warning should show up as soon as the
page loads, with the call stacks pointing at Angular's `HttpClient` call sites.

## Why this catches Angular's `HttpClient` at all

`HttpClient` doesn't call `fetch`/`XMLHttpRequest` directly — but by default (unless the app opts
into `provideHttpClient(withFetch())`), its `HttpXhrBackend` sits on top of `XMLHttpRequest`,
which is exactly what `init()` patches. This example uses the default backend
(`provideHttpClient()` with no `withFetch()`, in `app.config.ts`) — verified directly against this
project that the resulting warning's call stack does point into `HttpClient`'s XHR backend, not
just asserted from the docs.

## Why `init()` lives in `main.ts`

Like [`examples/vite-react`](../vite-react), this example calls `init()` directly at the top of
`main.ts`, before Angular bootstraps anything, rather than installing it from inside a component.
Installing it at the true entry point guarantees it's active before _any_ component gets a chance
to mount — see that example's README for the more framework-specific version of this reasoning
(React's effect ordering, specifically).

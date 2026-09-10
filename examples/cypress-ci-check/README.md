# Cypress CI-check example

Shows the actual point of `collectIssues()`: a duplicate-fetch regression can fail a build, not
just print a console warning nobody was watching.

## Run it

```sh
npm install
npm test
```

That starts a static server (`serve`), waits for it, runs the Cypress suite headlessly against
it, and tears the server down — the same `start-server-and-test` combo a real CI pipeline would
use. `npm run cy:open` runs the same spec in Cypress's interactive runner instead.

## What the two tests actually prove

`cypress/e2e/network-hygiene.cy.js` has two tests, and both matter:

- **Correct flow → zero issues.** Loads the page's "correct" button (one fetch, one call site)
  and asserts `collectIssues()`'s array is empty.
- **Buggy flow → the issue is actually caught.** Loads the "buggy" button (the same
  duplicate-inflight pattern every other example demonstrates) and asserts the array is non-empty
  **and** the issue's `kind` is `duplicate-inflight`.

A suite that only ever asserted "zero issues" would also pass if `collectIssues()` were silently
broken and catching nothing — the second test is what makes this a real regression check instead
of a tautology that always goes green.

## How the page and the test talk to each other

`index.html` calls `collectIssues()` once, on load, and puts the result on `window.__wdyf`. Cypress
test code runs in the same browser as the page under test, so `cy.window().its('__wdyf').its('issues')`
reads that array directly — no bridging, no `cy.intercept()` needed, since the library is already
watching every real `fetch`/`XHR` call itself.

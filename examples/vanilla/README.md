# Vanilla example

No install, no build step. Demonstrates the plain `init()` API.

## Run it

`type="module"` scripts need to be served over HTTP(S), not opened via `file://`. Any static
server works:

```sh
npx serve .
# or: python3 -m http.server
```

Then open the printed URL, open your browser console, and click the button.

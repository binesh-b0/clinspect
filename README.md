# clinspect

A local reverse proxy and terminal traffic inspector for development workflows.

`clinspect` is intended to sit between a client and an upstream service, forward HTTP traffic, and display captured request and response details in an Ink-based terminal UI.


## Requirements

- Node.js 18 or newer recommended
- npm

## Install

```sh
npm install
```

## Scripts  

```sh
npm start
```

Runs `node src/index.js`. At the moment this exits successfully without output because `src/index.js` is empty.

```sh
npm test
```

Runs the placeholder test script. It currently prints `Error: no test specified` and exits successfully.

## Intended Usage

Once implemented, the CLI is expected to accept a target URL and an optional local proxy port:

```sh
clinspect --target http://localhost:3000 --port 8080
```

Expected behavior:

- start a local reverse proxy on the selected port
- forward requests to the target URL
- capture request and response metadata and bodies
- render recent traffic in a terminal UI
- shut down cleanly on interrupt signals

## Project Layout

```text
bin/cli.js             CLI executable entrypoint
src/index.js           Application bootstrap and argument validation
src/engine/proxy.js    Reverse proxy engine
src/store/state.js     In-memory traffic log store
src/ui/App.js          Ink terminal UI
```

## Initialization Verification

Verified on this checkout:

- `package.json` is valid JSON and defines the `clinspect` package.
- The package is configured as an ES module package with `"type": "module"`.
- The `clinspect` binary is mapped to `./bin/cli.js`.
- `package-lock.json` is present and consistent enough for `npm ci --dry-run` to complete.
- `node_modules/` is present locally.
- `npm start` exits successfully.
- `npm test` exits successfully, but only runs the placeholder test command.

Open initialization items:

- `bin/cli.js` has no shebang and is not executable in the current checkout.
- Application source files are empty placeholders.
- There are no real tests yet.

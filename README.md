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

Runs the mock terminal inspector.

```sh
npm test
```

Runs the Node.js built-in test suite.

## Usage

Launch the mock inspector:

```sh
npm start
```

Or run the package binary directly:

```sh
node bin/cli.js
```

Launch a live proxy inspector:

```sh
clinspect --target http://localhost:3000 --port 8080
```

Then send traffic to `http://localhost:8080`; requests are forwarded to the target and captured in the terminal UI.

Current MVP behavior:

- starts an Ink terminal UI
- defaults to mock/demo traffic when `--target` is omitted
- starts live reverse proxy mode when `--target` is provided
- forwards live HTTP requests to the upstream target
- captures request/response headers, status, timing, and capped text bodies
- shows a traffic list and selected payload details
- supports up/down inspection, stable held selection, `f` follow-latest mode, tab focus toggle, detail scrolling, request/response tab switching, pause/resume, filters, search, clear logs, `q` quit, and Ctrl-C cleanup
- caps stored text bodies and marks truncated payloads

## Project Layout

```text
bin/cli.js             CLI executable entrypoint
src/index.js           Application bootstrap and argument validation
src/engine/proxy.js    Reverse proxy engine
src/store/state.js     In-memory traffic log store
src/ui/App.js          Ink terminal UI
```

## Verification

Run:

```sh
npm install
npm test
npm start
```

## MVP Scope

Included:

- mock traffic generation
- terminal two-pane navigation
- live reverse proxying
- request/response capture from real upstreams
- filtering and search
- capped body storage
- ring-buffer log state
- CLI option validation for `--target` and `--port`
- Node built-in tests

Deferred:

- WebSocket and CONNECT tunneling
- export/persistence

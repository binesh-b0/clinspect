# clinspect

A local reverse proxy and terminal traffic inspector for development workflows.

`clinspect` is intended to sit between a client and an upstream service, forward HTTP traffic, and display captured request and response details in an Ink-based terminal UI.

The current MVP is UI-first: it launches a terminal inspector with mock traffic so the interaction model can be tested before live proxy capture is added.

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

The CLI accepts optional future live-mode context and displays it in the mock UI:

```sh
clinspect --target http://localhost:3000 --port 8080
```

Current MVP behavior:

- starts an Ink terminal UI
- seeds realistic mock request/response entries
- appends new mock traffic on an interval
- shows a traffic list and selected payload details
- supports up/down inspection, stable held selection, `f` follow-latest mode, tab focus toggle, `q` quit, and Ctrl-C cleanup
- caps stored text bodies and marks truncated payloads

Live HTTP proxying is planned after the mock UI is stable.

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
- capped body storage
- ring-buffer log state
- CLI option validation for future `--target` and `--port` use
- Node built-in tests

Deferred:

- live reverse proxying
- request/response capture from real upstreams
- filtering and search
- export/persistence

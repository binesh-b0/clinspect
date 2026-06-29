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

Inspect a public website the same way:

```sh
clinspect --target https://www.example.com --port 8080
```

Open `http://localhost:8080`, not the public URL directly. Non-loopback targets are labeled as public in the header, and upstream redirects from that target are rewritten back to the local proxy origin where possible.

To open the local proxy URL automatically for a public target:

```sh
clinspect --target https://www.example.com --port 8080 --open
```

Current MVP behavior:

- starts an Ink terminal UI
- defaults to mock/demo traffic when `--target` is omitted
- starts live reverse proxy mode when `--target` is provided
- labels non-loopback live targets as public targets
- can open the local proxy URL automatically for public targets with `--open`
- forwards live HTTP requests to the upstream target
- rewrites target redirects back to the local proxy origin where possible
- captures request/response headers, status, timing, and capped text bodies
- shows a traffic list and selected payload details
- supports up/down inspection, stable held selection, `f` follow-latest mode, tab focus toggle, detail scrolling, request/response tab switching, pause/resume, clear logs, `q` quit, and Ctrl-C cleanup
- opens a bottom filter panel with `/`, supports multi-select method/status options, and searches all, path, status, method, time, host, port, headers, or body
- supports quick filter controls: `m` opens method filters, `s` opens status filters, `space` toggles options, and `x` clears active filters
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

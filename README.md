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

Runs inspector.

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

Live proxy mode requests readable upstream responses by default so the response pane can show text bodies. To preserve the client `Accept-Encoding` header exactly:

```sh
clinspect --target https://www.example.com --preserve-encoding
```

Captured request and response bodies are capped at 1 MiB by default. Use `--body-limit` only when you need a different capture budget:

```sh
clinspect --target https://www.example.com --body-limit 262144
```

Record every captured request to disk:

```sh
clinspect --target http://localhost:3000 --record full
```

Record only requests inspected with `Enter`:

```sh
clinspect --target http://localhost:3000 --record partial
```

By default recordings are written to `./.clinspect/recordings/clinspect-YYYYMMDD-HHmmss.ndjson`. To choose an exact file path:

```sh
clinspect --target http://localhost:3000 --record full --record-path ./captures/session.ndjson
```

Load a recorded session without starting live or demo traffic:

```sh
clinspect --load ./.clinspect/recordings/clinspect-YYYYMMDD-HHmmss.ndjson
```

Cookie values are masked by default in the UI and search. When recording is enabled, cookie values are written to the NDJSON capture by default:

```sh
clinspect --target http://localhost:3000 --show-cookie-values
clinspect --target http://localhost:3000 --record full
```

Use `--record` only for trusted local captures. Raw cookie recordings may contain session secrets.

Current MVP behavior:

- starts an Ink terminal UI
- defaults to mock/demo traffic when `--target` is omitted
- starts live reverse proxy mode when `--target` is provided
- labels non-loopback live targets as public targets
- can open the local proxy URL automatically for public targets with `--open`
- forwards live HTTP requests to the upstream target
- requests uncompressed upstream responses by default, with `--preserve-encoding` for exact `Accept-Encoding` forwarding
- rewrites target redirects back to the local proxy origin where possible
- captures request/response headers, status, timing, and capped text bodies with a configurable `--body-limit`
- preserves multiple `Set-Cookie` headers, masks cookie values in the UI by default, and records cookie values when recording is enabled
- shows a traffic list and selected payload details with structured, color-coded JSON response trees
- opens a full-screen detail inspector with `o`, closes it with `esc` or `q`, and supports request/response tab switching with `r`
- supports detail search with `/` when details are focused, including plain text, `/regex/`, JSON path/value matches, and `n`/`N` match navigation
- supports up/down inspection, stable held selection, `f` follow-latest mode, tab focus toggle, detail scrolling, tree expand/collapse with `enter`, capture pause/resume with `p`, recording start/pause/resume with `P`, recording stop with `S`, clear logs, `q` quit, and Ctrl-C cleanup
- opens a bottom traffic filter panel with `/` when the traffic list is focused, supports multi-select method/status options, and searches all, path, status, method, time, host, port, headers, or body
- supports quick filter controls: `m` opens method filters, `s` opens status filters, `space` toggles options, and `x` clears active filters
- supports opt-in NDJSON disk recording for all captured traffic or only inspected entries
- can load recorded NDJSON sessions for offline inspection with `--load`
- caps stored text bodies and marks truncated payloads

## Project Layout

```text
bin/cli.js             CLI executable entrypoint
src/index.js           Application bootstrap and argument validation
src/engine/proxy.js    Reverse proxy engine
src/recording/         NDJSON disk recording
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
- opt-in NDJSON recording
- recorded session replay
- safe cookie inspection with opt-in raw UI display and default cookie capture when recording is enabled
- CLI option validation for `--target` and `--port`
- Node built-in tests

Deferred:

- WebSocket and CONNECT tunneling
- browser storage inspection for `localStorage`, `sessionStorage`, IndexedDB, and Cache Storage

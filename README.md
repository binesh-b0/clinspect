# clinspect

`clinspect` is a local reverse proxy and terminal UI for inspecting HTTP traffic during development.

It can run in demo mode, proxy live traffic to an upstream target, record sessions to NDJSON, replay saved sessions, and send manual requests from inside the TUI.

## Responsible Use

Use `clinspect` only with systems, accounts, and traffic that you own or are explicitly authorized to test. Do not use it to intercept credentials, bypass access controls, exfiltrate data, attack services, or inspect third-party traffic without permission.

Users are responsible for how they run this tool. The author, maintainers, and contributors are not responsible for malicious, unauthorized, or illegal use.

## Requirements

- Node.js 18 or newer
- npm

## Install

```sh
npm install
```

## Quick Start

Run demo mode with mock traffic:

```sh
npm start
```

Run the package binary directly:

```sh
node bin/cli.js
```

The examples below use `clinspect` as the command name. From a local clone, use `node bin/cli.js` instead or link the package with `npm link`.

Start a live proxy:

```sh
clinspect --target http://localhost:3000 --port 8080
```

Then send traffic to `http://localhost:8080`. Requests are forwarded to the target and shown in the terminal UI.

Inspect a public target through the local proxy:

```sh
clinspect --target https://www.example.com --port 8080
```

Open `http://localhost:8080`, not the public URL directly. Non-loopback targets are labeled as public in the header, and upstream redirects from that target are rewritten back to the local proxy origin where possible.

To open the local proxy URL automatically for public targets:

```sh
clinspect --target https://www.example.com --port 8080 --open
```

## Manual Requests

In live mode:

- `n` creates a new request.
- `e` clones the selected traffic row into a request draft.
- `l` opens saved requests.
- `1`-`7` jumps between Params, Headers, Body, Auth, Cookies, Env, and Save.
- `enter` opens a preview; `enter` or `y` confirms the send; `esc` or `n` returns to editing.

The composer supports target-relative paths, absolute `http(s)` URLs, query params, headers, auth, cookies, local environment variables like `{{token}}`, raw/JSON/form/multipart bodies, and local file-path uploads.

Saved requests and environment rows are stored in `./.clinspect/requests.json`.

## Recording And Replay

Record every captured request:

```sh
clinspect --target http://localhost:3000 --record full
```

Record only requests inspected with `enter`:

```sh
clinspect --target http://localhost:3000 --record partial
```

By default, recordings are written to:

```text
./.clinspect/recordings/clinspect-YYYYMMDD-HHmmss.ndjson
```

Choose an exact recording path:

```sh
clinspect --target http://localhost:3000 --record full --record-path ./captures/session.ndjson
```

Load a recorded session without live or demo capture:

```sh
clinspect --load ./.clinspect/recordings/clinspect-YYYYMMDD-HHmmss.ndjson
```

## Privacy And Security Notes

- `clinspect` is intended for local development and debugging, not as a hardened production proxy.
- Captured traffic can include credentials, cookies, bearer tokens, API keys, and request or response bodies.
- `.clinspect/` is ignored by git in this repository. Keep it that way unless you are intentionally sharing sanitized captures.
- Cookie values are masked by default in the UI and search.
- Recordings write raw cookie values by default when `--record` is enabled. Use recordings only for trusted local captures.
- Request collections may store secret values in `./.clinspect/requests.json`; masking is a UI behavior, not encryption.
- Absolute manual requests are sent directly from your machine. Only send requests to endpoints you are authorized to call.

Show raw cookie values in the UI and search:

```sh
clinspect --target http://localhost:3000 --show-cookie-values
```

Preserve the client `Accept-Encoding` header exactly:

```sh
clinspect --target https://www.example.com --preserve-encoding
```

Change the body capture limit from the 1 MiB default:

```sh
clinspect --target https://www.example.com --body-limit 262144
```

## Key Bindings

Main UI:

- `j`/`k` or arrow keys move through traffic/details.
- `[`/`]` or PageUp/PageDown moves by a page.
- `Ctrl-u`/`Ctrl-d` moves by half a page.
- `g`/`G` jumps to top/bottom.
- `tab` switches between traffic and details.
- `enter` inspects a traffic row or toggles a detail node.
- `r` switches request/response details.
- `/` searches traffic or details, depending on focus.
- `m` opens method filters; `s` opens status filters; `x` clears filters.
- `p` pauses capture.
- `P` starts, pauses, or resumes recording.
- `S` stops recording.
- `h` opens help.
- `q` quits.

Composer:

- `1` Params, `2` Headers, `3` Body, `4` Auth, `5` Cookies, `6` Env, `7` Save.
- `tab`, `shift-tab`, up, and down move fields.
- Left/right moves inside text fields or cycles selector fields.
- `a` adds a row; `d` deletes a row; `space` enables or disables a row.
- `R` reveals or masks secrets.
- `s` saves the draft.
- `enter` previews; `enter` or `y` confirms send; `esc` or `n` edits.

## Project Layout

```text
bin/cli.js             CLI executable entrypoint
src/index.js           Application bootstrap and runtime wiring
src/engine/            Proxy and manual request sending
src/recording/         NDJSON disk recording
src/store/state.js     In-memory traffic log store
src/ui/App.js          Ink terminal UI
test/                  Node.js test suite
```

## Verification

```sh
npm test
```

The test suite uses Node.js built-in test runner.

## Current Scope

Implemented:

- demo traffic mode
- live HTTP reverse proxy mode
- terminal traffic list and detail panes
- request/response headers, status, timing, and capped text body capture
- structured response previews with collapsible nodes for JSON, NDJSON, React Flight, SSE, forms, XML, and HTML
- traffic filtering and detail search
- manual request composer with saved local requests
- full and partial NDJSON recording
- replay from recorded NDJSON sessions
- mouse wheel scrolling in supported terminals
- cookie masking in the UI by default

Not implemented:

- WebSocket proxying
- HTTP CONNECT tunneling
- browser storage inspection for `localStorage`, `sessionStorage`, IndexedDB, or Cache Storage

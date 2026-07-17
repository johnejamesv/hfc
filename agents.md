# Handoff notes

## Latest handoff — T-009 implementation

T-009 is implemented and committed in this handoff. `app/completed-turn-queue.ts` records each
completed transcript identifier before classifying it, accepts it only once, serializes non-Stop
turns, and clears queued work immediately on Stop. `app/playground.tsx` routes queued turns through
the existing shared dispatcher; a voice Run awaits its matching Python worker result before the
next queued turn can mutate state. AI requests are also awaited. `app/voice-session.tsx` retains
the requested session across one-utterance recording/transcription and automatically re-arms the
recording client after handling a non-Stop turn. Realtime stays in its existing listening state.
Accessible status now announces pending proposals and test start/completion, while existing live
voice status and alerts announce listening and errors.

## Verification

On 2026-07-17, `npm run typecheck`, `npm run lint`, `npm test` (91 tests), and `npm run build`
passed. `app/completed-turn-queue.test.ts` covers duplicate IDs both before and after their original
turn, ordered serialization while busy, and Stop clearing queued mutations. The playground test
also proves a repeated completed transcript changes the editor only once.

## Hiccups and next task

`npm run test:e2e` could not complete in this environment because port 3000 was occupied by an
already-running Next dev server serving Next's “missing required error components, refreshing”
recovery page. Playwright could neither reuse that unhealthy server nor start a replacement, which
timed out waiting for the configured web server. Restart the existing dev server (or free port
3000) and rerun `npm run test:e2e` before claiming the task's full UI quality gate. The next
highest-priority item after that confirmation is T-010.

## Current state

T-005 is complete and committed in this handoff. `app/workers/python.worker.ts` loads Pyodide as a browser-only module inside a dedicated worker, runs the editable `solution.py` plus only the selected challenge's bundled tests, captures output, and returns structured completed or error responses. Assertion failures become named failed tests; syntax and runtime failures return a Python type and message.

`app/python-worker-client.ts` owns the worker lifecycle. It preloads after the page becomes interactive, queues a Run while loading, attaches a request identifier, ignores stale/late messages, and enforces the three-second limit by terminating the old worker and starting a normal loading-to-ready replacement lifecycle. `app/python-test-runner.tsx` is driven solely by the shared action state's `runRequests` count and renders a collapsible results panel with runtime state, test cases, captured output, exceptions, and timeouts.

## Verification

On 2026-07-15, these checks passed: `npm run typecheck`, `npm run lint`, `npm test` (28 tests), `npm run build`, and `npm run test:e2e`. `app/python-worker-client.test.ts` covers ready queuing, output, test pass/fail results, structured syntax/runtime errors, timeout, late messages, and recovery. The second WebKit e2e test fills a correct pair-sum solution and observes the real Pyodide worker report all three bundled cases passing.

## Hiccups and next task

Pyodide must remain loaded from its browser module URL in the worker. Importing the npm package made Next trace Node fallbacks such as `node:fs` and caused production builds to fail. The first real-worker e2e attempt also exceeded Playwright's default 30-second test limit even though all three cases had completed; the test has a 90-second allowance for cold Pyodide startup and now passes.

T-006 is now complete and committed. `app/transcript-router.ts` is a pure router plus pure
route-to-editor-action adapter. It recognizes only the documented exact grammar after
comparison-only normalization, reports invalid one-based line ranges visibly without changing
the document, and leaves dictation/AI routes non-mutating for their later tasks. Completed
transcripts now reach `app/playground.tsx`, which dispatches deterministic actions through the
same shared editor dispatcher as buttons. `app/voice-session.tsx` displays the latest untouched
transcript and its interpretation; a spoken Stop command disconnects the microphone.

## Verification

On 2026-07-15, `npm run typecheck`, `npm run lint`, `npm test` (61 tests), `npm run build`,
and `npm run test:e2e` passed. The Playwright report recorded `status: passed` after the real
Pyodide run.

## Hiccups and next task

The command wrapper has a one-minute foreground limit, while production builds and the real
Pyodide WebKit test can outlast it. Both continue in the background; confirm their final state
from the generated build artifacts and `test-results/.last-run.json` when that occurs.

T-007 is now complete and committed. `app/python-dictation.ts` is a pure, case-insensitive,
longest-phrase-first literal Python normalizer. It preserves unknown word spelling and order,
implements every documented token plus conventional spacing, and applies `new line`, `indent`,
and `dedent` relative to a supplied baseline indentation. `app/transcript-router.ts` turns a
dictation route into a single shared insert action and includes the normalized Python in the
visible interpretation. `app/voice-session.tsx` exposes the supported vocabulary in a compact
details element.

## Verification

On 2026-07-16, `npm run typecheck`, `npm test` (79 tests), and a changed-file ESLint check
passed. `npm run lint`, `npm run build`, and `npm run test:e2e` ran past the one-minute foreground
wrapper limit; the lint/build processes exited in the background, while Playwright's
`test-results/.last-run.json` records `status: passed`. The wrapper does not retain the full
lint/build exit output after timing out, so rerun either foreground command if its exact status
is needed.

## Hiccups and next task

The normalizer's baseline indentation is deliberately applied to every emitted line, including
the first. The router derives that baseline from the line containing the selection end; a future
change to selection-direction support should revisit that choice. The next highest-priority task
is T-008: targeted AI write/change proposals.

T-008 is now complete and committed. `app/api/edit/route.ts` is a server-only OpenAI Responses
API adapter that accepts only the challenge summary, current Python source, bounded selection,
and instruction. It uses strict structured output for a replacement and concise explanation,
validates both boundaries, never returns `OPENAI_API_KEY`, and supports deterministic local
development with `HFC_EDIT_ADAPTER=mock`. `app/playground.tsx` captures each proposal against
its source/range and shows a mobile review panel until the existing shared Apply or Discard action
is chosen. A `change` turn with a collapsed selection is rejected before the edit endpoint is
called.

## Verification

On 2026-07-17, `npm run typecheck`, `npm run lint`, `npm test` (87 tests), and
`npm run test:e2e` (2 mobile-WebKit tests) passed. `npm run build` exceeded the one-minute
foreground wrapper but exited in the background; `.next/BUILD_ID` and the compiled
`.next/server/app/api/edit/route.js` were present afterwards. Route, browser-client, and
playground tests cover structured-output validation, malformed responses, key isolation, mock
mode, selection gating without a request, review, and captured-range Apply behavior.

## Hiccups and next task

The current mock proposal intentionally prefixes the replacement with a comment so local review
has a visible diff; it is not intended to solve the challenge. The primary OpenAI docs MCP was
added globally during this handoff and becomes available after a Codex restart; official web docs
were used as the temporary fallback. The next highest-priority task is T-009: complete the
hands-free interaction loop, especially completed-turn de-duplication and serialization while
edit requests or tests are active.

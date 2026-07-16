# Handoff notes

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

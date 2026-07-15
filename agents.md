# Handoff notes

## Current state

T-005 is complete and committed in this handoff. `app/workers/python.worker.ts` loads Pyodide as a browser-only module inside a dedicated worker, runs the editable `solution.py` plus only the selected challenge's bundled tests, captures output, and returns structured completed or error responses. Assertion failures become named failed tests; syntax and runtime failures return a Python type and message.

`app/python-worker-client.ts` owns the worker lifecycle. It preloads after the page becomes interactive, queues a Run while loading, attaches a request identifier, ignores stale/late messages, and enforces the three-second limit by terminating the old worker and starting a normal loading-to-ready replacement lifecycle. `app/python-test-runner.tsx` is driven solely by the shared action state's `runRequests` count and renders a collapsible results panel with runtime state, test cases, captured output, exceptions, and timeouts.

## Verification

On 2026-07-15, these checks passed: `npm run typecheck`, `npm run lint`, `npm test` (28 tests), `npm run build`, and `npm run test:e2e`. `app/python-worker-client.test.ts` covers ready queuing, output, test pass/fail results, structured syntax/runtime errors, timeout, late messages, and recovery. The second WebKit e2e test fills a correct pair-sum solution and observes the real Pyodide worker report all three bundled cases passing.

## Hiccups and next task

Pyodide must remain loaded from its browser module URL in the worker. Importing the npm package made Next trace Node fallbacks such as `node:fs` and caused production builds to fail. The first real-worker e2e attempt also exceeded Playwright's default 30-second test limit even though all three cases had completed; the test has a 90-second allowance for cold Pyodide startup and now passes.

The next highest-priority task is T-006: implement the deterministic transcript router. It should be a pure tested module, match exact control/edit grammar before literal or AI routes, and route the existing voice completed turns through the shared editor action dispatcher without guessing unknown phrases.

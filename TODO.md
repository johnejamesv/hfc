# HFC implementation backlog

This is the ordered implementation backlog. Checkboxes are advisory: an item is complete only when its acceptance criteria are present in the repository and the applicable quality gates pass. Always inspect the implementation rather than trusting this file.

When completing an item:

1. Keep the scope in `SPEC.md` unchanged unless a contradiction makes implementation impossible.
2. Implement the highest-priority incomplete or incorrectly completed item whose prerequisites are satisfied.
3. Add or update automated tests in the same iteration.
4. Run the applicable quality gates.
5. Check the item only after verification and add concise evidence beneath it.
6. Do not begin speculative later work merely because the current task is blocked.

## P0: Critical path

### T-001 — Bootstrap the web project

- [x] Create a Next.js App Router project using TypeScript and npm.
- [x] Add scripts for `typecheck`, `lint`, `test`, `test:e2e`, and `build`.
- [x] Configure Vitest, React Testing Library, and Playwright.
- [x] Add `.env.example` without secrets and ignore local environment files.
- [x] Render a minimal mobile-first application shell.
- [x] Add one unit test and one smoke e2e test proving the harness runs.

Acceptance:

- A clean install followed by all quality-gate commands succeeds.
- No generated secret or machine-specific file is tracked.
- The initial page is usable at a 390 by 844 pixel viewport.

Prerequisites: none.

Evidence: `npm ci` completes with zero vulnerabilities. Typecheck, lint, unit tests,
production build, and the 390×844 mobile WebKit smoke test all pass. The smoke test
also verifies the primary shell controls and absence of horizontal page scrolling.

### T-002 — Prove microphone transcription on the target iPhone

- [x] Add a server-only endpoint that creates short-lived OpenAI Realtime credentials.
- [x] Add a minimal WebRTC transcription client with explicit connect/disconnect state.
- [x] Show completed transcript turns on screen.
- [x] Confirm permanent API credentials are absent from client bundles and browser storage.
- [x] Document the physical-iPhone result and any Safari-specific constraint.
- [x] If the four-hour Realtime spike fails, implement and document the one-utterance `MediaRecorder` fallback behind the same transcript callback.

Acceptance:

- A spoken phrase appears as a completed transcript on the physical iPhone, or the documented fallback does so.
- Starting and stopping twice does not create duplicate active microphone sessions.
- Missing credentials produce a safe, actionable error.
- Realtime client state transitions follow the normative lifecycle in `SPEC.md` and have
  automated coverage where browser APIs can be mocked, including repeated Connect,
  repeated Disconnect, failure cleanup, and Disconnect while Connect is pending.

Prerequisites: T-001.

Evidence: The app retains the GA client-secret and browser-WebRTC flow, with the permanent
OpenAI credential read only by `app/api/realtime-token/route.ts`. Unit coverage proves
repeated Connect and Disconnect safety, pending-connect invalidation, failure cleanup, and
completed-turn de-duplication. Because OpenRouter does not provide that Realtime credential
flow, the app selects a one-utterance `MediaRecorder` fallback for an OpenRouter key and sends
the captured audio to the server-only `/api/transcribe` route using
`openai/gpt-4o-transcribe`; raw audio is not persisted and both clients use the same completed
transcript callback. On 2026-07-15, two consecutive record/stop/transcribe cycles succeeded
in system Safari on an iPhone 13 Pro Max running iOS 18.7.8. The standalone Safari version
was not exposed/found on the device. The first observed OpenRouter transcription took about
90 seconds, so high and variable fallback latency is a known demo constraint. Typecheck,
lint, the full 18-test unit suite, production build, and mobile-WebKit Playwright smoke test
all pass. The WebKit browser binary was installed before the final e2e run.

### T-003 — Build the challenge and editor shell

- [x] Define a typed challenge model with starter code and deterministic tests.
- [x] Add three original Python challenges, including one designated demo challenge.
- [x] Render the challenge prompt, examples, and challenge selector.
- [x] Integrate a controlled CodeMirror 6 editor with Python highlighting and line numbers.
- [x] Add Reset with confirmation.

Acceptance:

- Switching challenges displays the correct prompt and restores that challenge's current
  in-memory source; persistence across reloads remains T-010 scope.
- Canceling Reset leaves source and history unchanged; confirming Reset restores the
  bundled starter source.
- The editor works with touch and the normal iOS keyboard.
- Component tests cover challenge switching and reset behavior.

Prerequisites: T-001.

Evidence: `app/challenges.ts` defines three typed, original challenges with structured
deterministic cases and designates Find a matching pair as the demo. The client playground
retains an independent in-memory source for every challenge and renders each prompt and
example. CodeMirror 6 is installed through the root lockfile and provides a controlled,
keyboard-editable Python document with syntax highlighting, line numbers, four-space
indentation, and editor history. Reset cancellation leaves the current editor instance and
source untouched; confirmation restores starter code and recreates the editor history.
Component coverage exercises all three challenge switches, independent source retention,
and both reset outcomes. After a clean `npm ci`, production build, typecheck, lint, all 20
unit/component tests, and the 390×844 mobile-WebKit e2e test pass. The WebKit test types into
the real CodeMirror editor, verifies challenge retention and both reset paths, and confirms
there is no page-level horizontal scrolling. A headed iPhone-sized browser check confirmed
the same behavior and touch-sized controls; a physical-iPhone editor/keyboard check remains
part of final device verification.

### T-004 — Establish the shared action and pending-edit model

- [x] Define typed actions for selection, insertion, indentation, deletion, undo, redo, run, apply, and discard.
- [x] Route visible editor controls through the shared action dispatcher.
- [x] Model an AI proposal separately from live CodeMirror state.
- [x] Apply a proposal as one undoable transaction.
- [x] Reject invalid ranges without changing the document.

Acceptance:

- The action layer is independent of microphone and OpenAI code.
- Applying and undoing a proposed replacement restores the exact original source.
- Unit tests cover the normative action examples in `SPEC.md`, including resulting source,
  selection, pending proposal, error, and undo behavior where applicable.
- A proposal captured against stale source cannot be applied and leaves both the live
  source and pending proposal unchanged.

Prerequisites: T-003.

Evidence: `app/editor-actions.ts` defines the microphone/OpenAI-independent typed action
state, range validation, undo/redo stacks, run requests, and separately captured pending
proposal model. `app/playground.tsx` now owns per-challenge action state and routes Undo,
Redo, Run, Apply, and Discard controls through the shared dispatcher while syncing editor
source and selection. `app/editor-actions.test.ts` covers the normative insertion,
replacement, selection, deletion, indentation, outdent, proposal apply/discard, stale
proposal, invalid range, run, undo, and redo examples. On 2026-07-15, `npm run
typecheck`, `npm run lint`, `npm test` (25 tests), `npm run build`, and `npm run
test:e2e` all passed. WebKit was installed and host browser dependencies were added before
the successful e2e rerun; the first e2e attempt failed only because the WebKit executable
and libraries were absent in the container.

### T-005 — Run bundled Python tests in a worker

- [x] Load Pyodide in a dedicated module Web Worker.
- [x] Preload the worker after the page becomes interactive and expose loading/ready/error states.
- [x] Execute the current solution with the selected challenge's tests.
- [x] Return standard output, exceptions, and structured per-test results.
- [x] Enforce a three-second timeout by terminating and recreating the worker.

Acceptance:

- The demo challenge has observable failing and passing solutions.
- An infinite loop times out without freezing the page.
- A subsequent run succeeds after a timeout recreates the worker.
- Worker messaging and result presentation follow the normative result contract in
  `SPEC.md`; automated tests cover pass, assertion failure, captured output, syntax or
  runtime error, timeout, late messages from a terminated worker, and recovery.

Prerequisites: T-003.

Evidence: `app/workers/python.worker.ts` loads the browser-only Pyodide module inside a
dedicated module worker and executes each selected challenge's source and bundled cases.
`app/python-worker-client.ts` preloads the worker after the client mounts, queues runs until
ready, gives every run an identifier, ignores stale responses, and terminates/recreates the
worker after three seconds. `app/python-test-runner.tsx` uses the shared editor Run request
count and presents loading, runtime error, timeout, captured output, structured exception,
and named pass/fail states. `app/python-worker-client.test.ts` covers queued runs, standard
output, pass/fail results, syntax/runtime errors, timeout, late replies, and recovery. On
2026-07-15, `npm run typecheck`, `npm run lint`, `npm test` (28 tests), `npm run build`, and
`npm run test:e2e` (including a real Pyodide 3/3 passing mobile-WebKit run) passed.

### T-006 — Implement deterministic voice routing

- [x] Implement a pure transcript router with explicit `control`, `edit`, `dictation`, `ai`, and `unknown` results.
- [x] Match control and deterministic edit grammar before all AI routes.
- [x] Parse line numbers and inclusive line ranges.
- [x] Connect routed deterministic commands to the shared action dispatcher.
- [x] Show the raw transcript and interpreted action.

Acceptance:

- All required commands in `SPEC.md` have table-driven tests.
- Similar but unsupported phrases return `unknown` and do not mutate source.
- Out-of-bounds selections produce a visible error and no mutation.
- No generative model is called for recognized deterministic commands.
- Tests use the one-based line and selection semantics defined in `SPEC.md`, including
  first-line, last-line, reversed-range, and beyond-end cases.
- Router fixtures cover case, repeated whitespace, allowed terminal punctuation, and added
  or unsupported words that must remain `unknown`.

Prerequisites: T-002 and T-004.

Evidence: `app/transcript-router.ts` normalizes only comparison text, then deterministically
classifies exact control and edit grammar before dictation and AI cues. Its pure action adapter
uses one-based inclusive line semantics, reports invalid line ranges without changing editor
state, and creates the correctly indented New line insertion. `app/playground.tsx` routes
completed voice turns through that adapter and the existing shared dispatcher, while
`app/voice-session.tsx` retains the raw transcript and visible interpretation (including the
unknown-input message). `app/transcript-router.test.ts` provides 33 table-driven and state
fixtures for all required commands, normalization, unsupported additions, first/last lines,
reversed/beyond-end ranges, and the non-mutating dictation/AI routes. On 2026-07-15,
`npm run typecheck`, `npm run lint`, `npm test` (61 tests), `npm run build`, and `npm run
test:e2e` passed; the latter recorded Playwright `status: passed`.

### T-007 — Implement literal Python dictation

- [x] Implement the documented spoken-token vocabulary as a pure normalizer.
- [x] Support new lines and indentation relative to the current editor context.
- [x] Insert normalized `type ...` utterances through the shared action dispatcher.
- [x] Keep the raw transcript and normalized Python visible.
- [x] Document the supported vocabulary in the UI.

Acceptance:

- Unit fixtures cover every documented token and representative multi-line snippets.
- The normative dictation fixtures in `SPEC.md` pass exactly, including whitespace and
  indentation.
- Unknown words are preserved rather than silently discarded.
- Literal dictation never calls the AI edit endpoint.
- Each utterance can be undone in one operation.

Prerequisites: T-004 and T-006.

Evidence: `app/python-dictation.ts` is a pure, longest-phrase-first normalizer that preserves
unknown word spelling and implements the documented Python tokens, spacing, and layout. The
router converts each dictation route into one shared insert action with the current line's
indentation; its visible interpretation includes the normalized Python. `app/python-dictation.test.ts`
contains all five normative fixtures, documented-vocabulary coverage, casing/unknown-word, and
relative-indentation fixtures. On 2026-07-16, `npm run typecheck`, `npm test` (79 tests), and
the changed-file ESLint check passed. The full lint and production-build processes completed
after the one-minute wrapper limit; Playwright recorded `status: passed` for `npm run test:e2e`.

### T-008 — Add targeted AI write/change proposals

- [x] Add a server-only Responses API adapter with strict structured output.
- [x] Validate requests and responses at the server boundary.
- [x] Implement `write` at the cursor/selection and selection-required `change` behavior.
- [x] Return a replacement and concise explanation without applying it.
- [x] Render a readable mobile diff with Apply and Discard controls.
- [x] Provide a deterministic mock adapter for tests and local UI development.

Acceptance:

- A `change` request with no selection is rejected client-side without an API call.
- A valid proposal cannot alter content outside its captured range.
- A proposal is rejected as stale if the live source differs from the source against which
  it was captured; rejection does not mutate source or silently discard the proposal.
- Malformed model output produces an error and leaves source unchanged.
- Apply and Discard work without an API key when the mock adapter is enabled.
- Server tests prove the permanent API key is never serialized to the client.

Prerequisites: T-004.

Evidence: `app/api/edit/route.ts` validates bounded edit requests, uses the Responses API
with a strict `replacement`/`explanation` JSON schema, and keeps `OPENAI_API_KEY` server-only.
The `HFC_EDIT_ADAPTER=mock` option provides deterministic local proposals without a key.
`app/playground.tsx` rejects an unselected `change` before an API call, captures source and
range for the pending proposal, and renders the mobile review panel before either shared Apply
or Discard action can mutate the editor. `app/api/edit/route.test.ts`,
`app/ai-edit-client.test.ts`, and `app/playground-ai.test.tsx` cover validation, malformed
output, key isolation, mock mode, client failures, selection gating, review, and captured-range
application. On 2026-07-17, `npm run typecheck`, `npm run lint`, `npm test` (87 tests),
`npm run build`, and `npm run test:e2e` (2 mobile-WebKit tests) passed.

### T-009 — Complete the hands-free interaction loop

- [x] Feed each completed transcript turn into the router exactly once.
- [x] Automatically return to listening after handling an utterance while the session remains active.
- [x] Wire voice Apply, Discard, Run, Undo, Redo, and Stop to the same actions as buttons.
- [x] Prevent commands recorded during transcribing, applying, or running from executing twice.
- [x] Announce listening, pending edit, run completion, and errors accessibly.

Acceptance:

- Button and voice paths produce equivalent state transitions in tests.
- The rehearsed flow can be completed without touching the software keyboard after listening starts.
- Repeated transcript events do not duplicate an edit or test run.
- Completed turns are deduplicated and serialized according to the normative queue rules in
  `SPEC.md`; tests cover duplicates received both before and after the original turn runs.
- Stopping releases microphone tracks and returns the UI to idle.
- Stop takes priority over queued turns and prevents queued mutations from running after the
  session is stopped.

Prerequisites: T-002, T-005, T-006, T-007, and T-008.

Evidence: `app/completed-turn-queue.ts` records every accepted completed-turn identifier,
classifies it once, serializes it behind active AI edits and test runs, and gives Stop priority
over queued work. The playground resolves voice routes through the same editor dispatcher as
the visible controls; Run waits for its Python result before the next turn drains. The recording
fallback re-arms automatically after a completed turn while the requested session remains active.
`app/completed-turn-queue.test.ts` covers before/during/after duplicate delivery, arrival-order
serialization, and Stop clearing queued turns; the playground test proves a duplicate completed
turn changes the document once. On 2026-07-17, `npm run typecheck`, `npm run lint`, `npm test`
(91 tests), and `npm run build` passed. On 2026-07-18, a fresh `next dev` instance and the
mobile-WebKit `npm run test:e2e` suite passed (2 tests, including the real Pyodide run).

## P1: Demo completeness

### T-010 — Add persistence and installable PWA behavior

- [x] Persist the selected challenge and each solution in versioned local storage.
- [x] Recover safely from invalid or outdated stored data.
- [x] Add the web app manifest, icons, theme metadata, and standalone layout behavior.
- [x] Respect iPhone safe-area insets and 44-pixel minimum primary touch targets.
- [x] Avoid storing credentials, audio, or transcripts persistently.

Acceptance:

- Reloading restores each challenge's latest source.
- Malformed JSON, wrong field types, an unsupported schema version, and an unknown selected
  challenge all fall back safely without crashing or contaminating valid challenge data.
- The app is installable from Safari and remains usable in standalone mode.
- Automated tests cover per-challenge round trips and each invalid-storage case. Manifest
  tests verify name, short name, start URL, standalone display, theme metadata, and required
  icon declarations; physical installation and standalone layout remain manual checks.

Prerequisites: T-003 and T-004.

Evidence: `app/persistence.ts` stores only schema-versioned selected-challenge and per-challenge
source strings under `hfc-progress`; its decoder rejects malformed, obsolete, and incorrectly
shaped records while retaining valid known challenge sources where safe. `app/manifest.ts`,
`app/icon.svg`, layout metadata, and the existing safe-area/touch-target CSS provide installable
standalone PWA metadata without persisting credentials, audio, or transcripts. On 2026-07-18,
`npm run typecheck`, `npm run lint`, `npm test` (100 tests), `npm run build`, and the two-test
mobile-WebKit `npm run test:e2e` suite passed. `persistence.test.ts`, the playground reload test,
and `manifest.test.ts` cover round trips, invalid storage, and manifest declarations. Physical
Safari installation and standalone-layout verification remain part of T-011's device handoff.

### T-011 — Harden and verify the complete demo flow

- [x] Add an e2e test for challenge selection, deterministic editing, AI proposal review, Apply, and test execution using mocked OpenAI responses.
- [x] Add failure-path coverage for denied microphone permission, Realtime credential or
      negotiation failure, AI request failure, malformed AI output, and Python timeout.
- [x] Verify responsive behavior with Playwright WebKit at the target viewport.
- [ ] Run the rehearsed flow repeatedly on the physical iPhone.
- [ ] Record the final device, iOS version, browser, model configuration, and known limitations.

Acceptance:

- All quality gates pass from a clean checkout.
- The primary flow succeeds three consecutive times on the physical target device.
- No step in the primary flow requires software-keyboard input.
- Errors leave the editor contents recoverable and the microphone stoppable.

Prerequisites: T-009 and T-010.

Evidence: Automated verification is complete. On 2026-07-20, the retained browser matrix injected
completed transcript turns after a mocked WebRTC boundary while preserving the real router, queue,
editor dispatcher, proposal client/UI, and Pyodide worker. It covered deterministic editing,
deduplication, persistence, AI rejection/Discard/Apply/malformed output, queue ordering and Stop
priority, all three challenge suites, syntax/runtime/timeout recovery, and three consecutive
transcript-only primary rehearsals. `npm run typecheck`, `npm run lint`, `npm test` (103 tests),
`npm run build`, and all 16 Playwright cases passed across 390×844 mobile WebKit and desktop
Chromium. Microphone capture/transcription was outside this run; physical-iPhone repetitions and
final device/model details remain required manual verification and are intentionally unchecked.

### T-012 — Prepare the public hackathon repository

- [x] Add an MIT license.
- [x] Write a concise README with the problem, product boundary, architecture, setup, environment variables, screenshots, and demo script.
- [x] Credit dependencies and state that bundled challenges are original.
- [x] Add a short architecture diagram and limitations section.
- [x] Audit tracked files and git history for credentials and private material.
- [x] Document how to run each quality gate.

Acceptance:

- A new developer can start the app using only the README and their own API key.
- No secret, generated audio, or copyrighted LeetCode problem text is tracked.
- README claims match the demonstrated implementation.
- All quality gates pass after following the documented clean-install steps.

Prerequisites: T-011.

Evidence: `README.md` documents the bounded product, setup, environment variables, demo,
quality gates, original challenges, dependencies, Mermaid architecture, limitations, and a
current iPhone-sized WebKit screenshot; `LICENSE` is MIT. A tracked-file audit plus an
all-history credential-pattern scan found no credential values or generated audio/private
material (the only local QR image remains untracked). On 2026-07-18, the complete pre-clean
quality pass succeeded: typecheck, lint, 100 unit tests, production build, and all three
mobile-WebKit e2e tests. A subsequent `npm ci` completed with zero vulnerabilities; physical
iPhone validation remains intentionally outstanding in T-011.

## Completion condition

Do not declare the project complete merely because every checkbox is checked. Completion requires inspecting the implementation, running all quality gates from a clean state, and verifying the complete demo on the physical iPhone.

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

- [ ] Add a server-only endpoint that creates short-lived OpenAI Realtime credentials.
- [ ] Add a minimal WebRTC transcription client with explicit connect/disconnect state.
- [ ] Show completed transcript turns on screen.
- [ ] Confirm permanent API credentials are absent from client bundles and browser storage.
- [ ] Document the physical-iPhone result and any Safari-specific constraint.
- [ ] If the four-hour Realtime spike fails, implement and document the one-utterance `MediaRecorder` fallback behind the same transcript callback.

Acceptance:

- A spoken phrase appears as a completed transcript on the physical iPhone, or the documented fallback does so.
- Starting and stopping twice does not create duplicate active microphone sessions.
- Missing credentials produce a safe, actionable error.
- Realtime client state transitions have automated coverage where browser APIs can be mocked.

Prerequisites: T-001.

Evidence: pending.

### T-003 — Build the challenge and editor shell

- [ ] Define a typed challenge model with starter code and deterministic tests.
- [ ] Add three original Python challenges, including one designated demo challenge.
- [ ] Render the challenge prompt, examples, and challenge selector.
- [ ] Integrate a controlled CodeMirror 6 editor with Python highlighting and line numbers.
- [ ] Add Reset with confirmation.

Acceptance:

- Switching challenges displays the correct prompt and starter source.
- Reset cannot erase work without confirmation.
- The editor works with touch and the normal iOS keyboard.
- Component tests cover challenge switching and reset behavior.

Prerequisites: T-001.

Evidence: pending.

### T-004 — Establish the shared action and pending-edit model

- [ ] Define typed actions for selection, insertion, indentation, deletion, undo, redo, run, apply, and discard.
- [ ] Route visible editor controls through the shared action dispatcher.
- [ ] Model an AI proposal separately from live CodeMirror state.
- [ ] Apply a proposal as one undoable transaction.
- [ ] Reject invalid ranges without changing the document.

Acceptance:

- The action layer is independent of microphone and OpenAI code.
- Applying and undoing a proposed replacement restores the exact original source.
- Unit tests cover valid actions, invalid ranges, Apply, Discard, and Undo.

Prerequisites: T-003.

Evidence: pending.

### T-005 — Run bundled Python tests in a worker

- [ ] Load Pyodide in a dedicated module Web Worker.
- [ ] Preload the worker after the page becomes interactive and expose loading/ready/error states.
- [ ] Execute the current solution with the selected challenge's tests.
- [ ] Return standard output, exceptions, and structured per-test results.
- [ ] Enforce a three-second timeout by terminating and recreating the worker.

Acceptance:

- The demo challenge has observable failing and passing solutions.
- An infinite loop times out without freezing the page.
- A subsequent run succeeds after a timeout recreates the worker.
- Worker messaging and result presentation have automated tests.

Prerequisites: T-003.

Evidence: pending.

### T-006 — Implement deterministic voice routing

- [ ] Implement a pure transcript router with explicit `control`, `edit`, `dictation`, `ai`, and `unknown` results.
- [ ] Match control and deterministic edit grammar before all AI routes.
- [ ] Parse line numbers and inclusive line ranges.
- [ ] Connect routed deterministic commands to the shared action dispatcher.
- [ ] Show the raw transcript and interpreted action.

Acceptance:

- All required commands in `SPEC.md` have table-driven tests.
- Similar but unsupported phrases return `unknown` and do not mutate source.
- Out-of-bounds selections produce a visible error and no mutation.
- No generative model is called for recognized deterministic commands.

Prerequisites: T-002 and T-004.

Evidence: pending.

### T-007 — Implement literal Python dictation

- [ ] Implement the documented spoken-token vocabulary as a pure normalizer.
- [ ] Support new lines and indentation relative to the current editor context.
- [ ] Insert normalized `type ...` utterances through the shared action dispatcher.
- [ ] Keep the raw transcript and normalized Python visible.
- [ ] Document the supported vocabulary in the UI.

Acceptance:

- Unit fixtures cover every documented token and representative multi-line snippets.
- Unknown words are preserved rather than silently discarded.
- Literal dictation never calls the AI edit endpoint.
- Each utterance can be undone in one operation.

Prerequisites: T-004 and T-006.

Evidence: pending.

### T-008 — Add targeted AI write/change proposals

- [ ] Add a server-only Responses API adapter with strict structured output.
- [ ] Validate requests and responses at the server boundary.
- [ ] Implement `write` at the cursor/selection and selection-required `change` behavior.
- [ ] Return a replacement and concise explanation without applying it.
- [ ] Render a readable mobile diff with Apply and Discard controls.
- [ ] Provide a deterministic mock adapter for tests and local UI development.

Acceptance:

- A `change` request with no selection is rejected client-side without an API call.
- A valid proposal cannot alter content outside its captured range.
- Malformed model output produces an error and leaves source unchanged.
- Apply and Discard work without an API key when the mock adapter is enabled.
- Server tests prove the permanent API key is never serialized to the client.

Prerequisites: T-004.

Evidence: pending.

### T-009 — Complete the hands-free interaction loop

- [ ] Feed each completed transcript turn into the router exactly once.
- [ ] Automatically return to listening after handling an utterance while the session remains active.
- [ ] Wire voice Apply, Discard, Run, Undo, Redo, and Stop to the same actions as buttons.
- [ ] Prevent commands recorded during transcribing, applying, or running from executing twice.
- [ ] Announce listening, pending edit, run completion, and errors accessibly.

Acceptance:

- Button and voice paths produce equivalent state transitions in tests.
- The rehearsed flow can be completed without touching the software keyboard after listening starts.
- Repeated transcript events do not duplicate an edit or test run.
- Stopping releases microphone tracks and returns the UI to idle.

Prerequisites: T-002, T-005, T-006, T-007, and T-008.

Evidence: pending.

## P1: Demo completeness

### T-010 — Add persistence and installable PWA behavior

- [ ] Persist the selected challenge and each solution in versioned local storage.
- [ ] Recover safely from invalid or outdated stored data.
- [ ] Add the web app manifest, icons, theme metadata, and standalone layout behavior.
- [ ] Respect iPhone safe-area insets and 44-pixel minimum primary touch targets.
- [ ] Avoid storing credentials, audio, or transcripts persistently.

Acceptance:

- Reloading restores each challenge's latest source.
- Corrupt storage falls back to starter content without crashing.
- The app is installable from Safari and remains usable in standalone mode.
- Persistence and manifest behavior have automated coverage where practical.

Prerequisites: T-003 and T-004.

Evidence: pending.

### T-011 — Harden and verify the complete demo flow

- [ ] Add an e2e test for challenge selection, deterministic editing, AI proposal review, Apply, and test execution using mocked OpenAI responses.
- [ ] Add failure-path coverage for denied microphone permission, network failure, malformed AI output, and Python timeout.
- [ ] Verify responsive behavior with Playwright WebKit at the target viewport.
- [ ] Run the rehearsed flow repeatedly on the physical iPhone.
- [ ] Record the final device, iOS version, browser, model configuration, and known limitations.

Acceptance:

- All quality gates pass from a clean checkout.
- The primary flow succeeds three consecutive times on the physical target device.
- No step in the primary flow requires software-keyboard input.
- Errors leave the editor contents recoverable and the microphone stoppable.

Prerequisites: T-009 and T-010.

Evidence: pending.

### T-012 — Prepare the public hackathon repository

- [ ] Add an MIT license.
- [ ] Write a concise README with the problem, product boundary, architecture, setup, environment variables, screenshots, and demo script.
- [ ] Credit dependencies and state that bundled challenges are original.
- [ ] Add a short architecture diagram and limitations section.
- [ ] Audit tracked files and git history for credentials and private material.
- [ ] Document how to run each quality gate.

Acceptance:

- A new developer can start the app using only the README and their own API key.
- No secret, generated audio, or copyrighted LeetCode problem text is tracked.
- README claims match the demonstrated implementation.
- All quality gates pass after following the documented clean-install steps.

Prerequisites: T-011.

Evidence: pending.

## Completion condition

Do not declare the project complete merely because every checkbox is checked. Completion requires inspecting the implementation, running all quality gates from a clean state, and verifying the complete demo on the physical iPhone.

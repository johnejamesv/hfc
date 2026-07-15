# Handoff notes

## Current state

T-003 is complete and ready to commit. `app/challenges.ts` contains three typed original
challenges and structured deterministic cases. `app/playground.tsx` owns selected-challenge
and per-challenge source state in memory. `app/code-editor.tsx` is a controlled CodeMirror 6
Python editor with syntax highlighting, line numbers, four-space indentation, keyboard
history, and a horizontally scrollable code surface. Confirmed Reset restores starter code
and clears that challenge's editor history by remounting it; canceled Reset changes nothing.

The previously committed `app/vendor/codemirror/node_modules` tree was not connected to the
root package manifest. It has been removed, and the required CodeMirror packages are now
declared in `package.json` and `package-lock.json`, so clean installs are reproducible.

## Verification

On 2026-07-15, a clean `npm ci` completed and the installed root tree contained the declared
CodeMirror packages. After building first, these checks passed: `npm run build`,
`npm run typecheck`, `npm run lint`, `npm test` (20 tests), and `npm run test:e2e`. The
390×844 mobile WebKit test types into the real editor, switches away and back to prove
in-memory retention, exercises canceled and confirmed Reset, and verifies no page-level
horizontal scrolling. A headed iPhone-sized check repeated those interactions and confirmed
the editor itself, not the page, scrolls for long code. A physical-iPhone keyboard/touch
check was not repeated for T-003 and should be included in final device verification.

## Hiccups and next task

On this Windows host, `npm ci` and `next build` can run for several minutes with output held
by RTK; a short command timeout can expire while the child process continues. Use a generous
timeout and build before typecheck because `.next` types are generated during the build. The
headed dev session reports a missing `/favicon.ico`; PWA icons are intentionally T-010
scope, not a T-003 regression.

The next highest-priority task is T-004: establish the typed shared editor/action model and
pending proposal state. Keep it independent of microphone and OpenAI code, preserve
CodeMirror undo/redo semantics, and cover every normative action/range/proposal example in
`SPEC.md`.

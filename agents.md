# Handoff notes

## Current state

T-002 is implemented and automatically verified except for its required physical-iPhone
acceptance check. The Realtime client uses the GA browser flow: the server-only
`app/api/realtime-token/route.ts` mints a short-lived credential for a Realtime session with
server VAD and input-audio transcription, and `app/realtime-transcription-client.ts` uses it
directly for WebRTC SDP negotiation. The permanent `OPENAI_API_KEY` is not imported by client
code and no credential is written to browser storage.

## Hiccup / next required action

This workspace has no target iPhone or configured OpenAI key, so a real microphone session
could not be exercised. Before marking T-002 complete, set `OPENAI_API_KEY` only in the server
environment, run the app from an HTTPS-reachable origin on the target iPhone, then start and
stop listening twice and confirm one spoken phrase appears under Completed transcripts. Record
the iPhone model, iOS version, Safari version, outcome, and any constraint in `TODO.md`.

The route deliberately uses `OPENAI_REALTIME_MODEL=gpt-realtime` plus
`OPENAI_REALTIME_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe` by default. This is not the
transcription-only `gpt-realtime-whisper` session: that session requires client-managed audio
commits and therefore cannot reliably split hands-free WebRTC microphone input into turns on
its own. Keep server VAD with `create_response: false` unless the client adds explicit turn
commits. If Safari cannot sustain this multi-turn WebRTC session during the four-hour spike,
implement the specified one-utterance `MediaRecorder` fallback behind the same
completed-transcript callback instead of treating T-002 as complete.

The sandbox also blocks local TCP listeners (`listen EPERM` on `127.0.0.1:3000`), so the
Playwright mobile smoke test cannot run here. This agent also found the checked-out
`node_modules` incomplete (the `tsc` shim targets a missing package). `npm ci` could not restore
it because registry DNS failed with `EAI_AGAIN`; it removed the incomplete modules before
failing. Restore dependencies with `npm ci` in an environment with registry access, then run
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and `npm run test:e2e` (the
last in an environment that permits the configured local dev server).

## Latest validation update

The Realtime lifecycle suite now also proves that a failed SDP negotiation can be retried and
that denied microphone permission closes the already-created data channel and peer connection.
Those tests remain unexecuted in this sandbox: `npm ci --offline` failed because the npm cache
does not contain `postcss`, and normal registry access is unavailable. Consequently,
`typecheck`, `test`, and `build` cannot find their local binaries; `lint` falls back to an
unrelated system ESLint 6; and `test:e2e` falls back to an unrelated Playwright command. After
restoring dependencies, run every quality gate before committing or marking any T-002 work
verified. The physical-iPhone acceptance check remains the priority blocker for T-002.

Git metadata is read-only in this sandbox, so this agent could not stage or commit the work
(`Unable to create .git/index.lock: Read-only file system`). Commit the task files together
with only the intended T-002 portions of `TODO.md`; do not accidentally include the unrelated
pre-existing edits to `SPEC.md`, the later `TODO.md` sections, `prompt.md`, or `status.md`.

## 2026-07-14 follow-up validation

T-002 remains incomplete because this environment has no physical iPhone, Safari microphone,
or server-side OpenAI credential. Do not check its physical-device acceptance box without
recording the requested device result. Added unexecuted lifecycle coverage in
`app/realtime-transcription-client.test.ts` now proves two complete start/stop cycles release
each track, data channel, and peer connection exactly once, and that a microphone stream which
arrives after Stop is immediately stopped and cannot negotiate a session.

Validation commands were attempted: `npm run typecheck`, `npm test`, `npm run lint`, `npm run
build`, and `npm run test:e2e`. They cannot validate the repository because the checked-out
`node_modules` is partial: `tsc`, `vitest`, and `next` are unavailable; lint resolves to a
system ESLint 6 that cannot read the flat config; and Playwright resolves to a system command
without `test`. Restore dependencies with `npm ci` where npm registry access is available,
then run every gate and physical-iPhone check. Git metadata is still read-only here, so staging
and committing may fail.

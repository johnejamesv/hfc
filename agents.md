# Handoff notes

## Current state

T-002 is complete and its implementation is ready to commit. The default path uses the
server-only OpenAI Realtime credential endpoint and browser WebRTC. When
`OPENROUTER_API_KEY` is set (or the legacy `OPENAI_API_KEY` has the `sk-or-` prefix), the UI
uses the documented one-utterance `MediaRecorder` fallback instead. The fallback posts
base64-encoded audio to server-only `/api/transcribe`, which uses
`openai/gpt-4o-transcribe` through OpenRouter and never persists the audio. Both paths
deliver the same completed-transcript callback.

## Physical-device evidence

On 2026-07-15, two consecutive record/stop/transcribe cycles completed in system Safari on
an iPhone 13 Pro Max running iOS 18.7.8. The standalone Safari version was not exposed on
the device. The first OpenRouter transcription took roughly 90 seconds, so the fallback has
high and variable latency and is a known demo constraint.

## Verification and next task

On 2026-07-15, these checks passed after building first (the build regenerates `.next` type
files that `tsc` consumes): `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`
(18 tests), and `npm run test:e2e` (mobile WebKit smoke test).

The next highest-priority task is T-003. It needs a typed three-challenge model, controlled
CodeMirror 6 Python editor, per-challenge in-memory source retention, reset confirmation,
and component coverage for switching and reset behavior. Keep this work independent of the
voice/OpenAI integration.

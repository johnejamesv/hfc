# HFC: Voice-First Python Playground

## Document status

- Status: approved proof-of-concept scope
- Target: OpenAI hackathon demo
- Primary device: iPhone using Safari
- Primary language: Python
- Distribution: public, MIT-licensed proof of concept
- Product boundary: a mobile coding playground, not a production IDE

## Product statement

HFC lets someone solve a small Python programming challenge on an iPhone without typing on the touchscreen keyboard. The user speaks literal code, precise editing commands, or a targeted natural-language change; HFC turns the utterance into an editor action, shows AI-generated changes before applying them, and runs the solution against local tests.

The proof of concept should demonstrate a new input model for code. It should not attempt to reproduce VS Code, LeetCode, or Codex on a phone.

## Demo promise

On an iPhone, a user can:

1. Open a bundled Python challenge.
2. Tap the microphone once to begin a voice session.
3. Dictate code and issue selection or indentation commands.
4. Ask for one targeted AI change to the selected code.
5. Say "apply" or tap Apply after reviewing the proposed change.
6. Say "run tests" or tap Run.
7. See the bundled tests pass without using the software keyboard.

The intended demo should take less than three minutes and use a rehearsed challenge whose solution is short enough to understand on a phone screen.

## Target user and problem

The target user is a programmer who wants to make small, deliberate code changes or solve a short algorithm problem while away from a comfortable keyboard. Mobile code editors exist, and coding agents can delegate whole tasks, but neither makes direct, precise code entry pleasant on a phone.

HFC optimizes for retaining control:

- deterministic operations remain deterministic;
- literal dictation does not silently invent logic;
- generative edits remain small and reviewable;
- every mutation is undoable;
- buttons remain available when speech is inconvenient.

## MVP experience

The main screen contains:

1. A compact challenge header with the prompt and examples.
2. A CodeMirror editor containing one virtual file named `solution.py`.
3. A collapsible test-results panel.
4. A transcript/status area showing what HFC heard and how it interpreted it.
5. A bottom control dock with Undo, microphone, Run, and context-dependent Apply/Discard controls.

The UI must fit an iPhone portrait viewport without horizontal page scrolling. The code editor may scroll horizontally when the code itself is wider than the viewport.

## Speech interaction model

HFC recognizes four classes of utterance. Classification order matters: deterministic control and edit commands must be attempted before sending anything to a generative model.

### 1. Control commands

Examples:

- "run tests"
- "undo"
- "redo"
- "apply"
- "discard"
- "stop listening"

Control commands dispatch the same typed application actions as their visible buttons.

### 2. Deterministic editing commands

Required commands:

- "go to line N"
- "select line N"
- "select lines N through M"
- "indent" or "indent once"
- "outdent" or "outdent once"
- "delete selection"
- "new line"

These commands apply immediately as a single undoable CodeMirror transaction. Invalid ranges do not mutate the document and produce a visible error.

### 3. Literal Python dictation

Utterances beginning with "type" are treated as literal dictation. A deterministic normalizer converts a documented vocabulary into Python text without inventing control flow or identifiers.

The initial vocabulary must include:

- layout: "new line", "indent", "dedent";
- punctuation: "colon", "comma", "dot", "open paren", "close paren", "open bracket", "close bracket", "open brace", "close brace";
- operators: "equals", "double equals", "not equals", "less than", "greater than", "less than or equal", "greater than or equal", "plus", "minus", "times", "divided by", "modulo";
- common Python tokens: `def`, `return`, `for`, `while`, `if`, `elif`, `else`, `in`, `range`, `enumerate`, `True`, `False`, and `None`.

Normalized text is inserted at the current selection or cursor as one undoable transaction. The transcript and normalized text remain visible after insertion.

### 4. AI-assisted code generation or editing

Utterances beginning with "write" request code at the current cursor or selection. Utterances beginning with "change" request a transformation of the current selection.

Examples:

- "write a loop over nums using enumerate"
- "change this loop to handle duplicate values"

AI requests create a pending edit rather than mutating the editor immediately. The UI shows the replacement as a diff and enables Apply and Discard. Voice commands and buttons must invoke the same Apply and Discard actions.

For the MVP, a "change" request requires a non-empty selection. If no code is selected, HFC explains that a selection is required and does not call the model. A generated replacement may affect only the selected range. A "write" request may insert only at the current cursor or replace the current selection.

## Voice session behavior

The desired experience is one tap to start listening, followed by multiple hands-free utterances until the user says "stop listening" or taps the microphone again.

Use OpenAI Realtime transcription over WebRTC so the browser can maintain a low-latency microphone session without exposing the permanent API key. The server creates short-lived client credentials; the browser owns the WebRTC connection and consumes completed transcript turns.

This integration is the highest-risk technical dependency and must be tested on the physical iPhone early. If a reliable multi-utterance Realtime session cannot be demonstrated within a four-hour spike, the documented demo fallback is tap-to-record one utterance at a time using `MediaRecorder` and the transcription API. The fallback must preserve the same transcript-to-action pipeline.

## Functional requirements

### Challenges and virtual file

- Include at least three bundled Python challenges and their deterministic test cases.
- Ship one rehearsed primary demo challenge.
- Each challenge owns one editable virtual file named `solution.py`.
- Switching challenges restores that challenge's most recently saved solution.
- Reset restores the bundled starter code only after confirmation.

### Editor and action system

- Use CodeMirror 6 with Python syntax highlighting and line numbers.
- Represent every user-visible mutation as a typed editor/application action.
- Voice commands and buttons must dispatch through the same action layer.
- Preserve CodeMirror undo/redo behavior for deterministic and applied AI edits.
- Keep a pending AI edit separate from the live document until Apply.

### Transcript routing

- Retain the most recent raw transcript and interpreted action in UI state.
- Normalize case and harmless terminal punctuation before matching commands.
- Match exact control and editing grammar before literal or AI routes.
- Never reinterpret an unknown utterance as an editor mutation.
- Show an "I didn't understand" state for unknown input.
- The command router and Python normalizer must be pure functions with unit tests.

For routing only, trim surrounding whitespace, collapse internal whitespace runs, compare
case-insensitively, and ignore trailing `.`, `,`, `!`, or `?` characters. Keep the untouched
transcript for display. Command grammar remains exact after that normalization: added words
or unsupported synonyms produce `unknown`. `N` and `M` are positive base-10 integers written
with digits; spoken number words are outside the initial grammar.

Line numbers spoken in deterministic commands are one-based. "Go to line N" creates a
collapsed selection at the beginning of that line. "Select line N" selects that line's
content, excluding its line separator. "Select lines N through M" selects from the beginning
of line N through the end of line M, also excluding the final line separator. The endpoints
are inclusive and `N` must be less than or equal to `M`. Zero, negative, reversed, or
beyond-end ranges are invalid and must leave both source and selection unchanged.

"New line" replaces the current selection with a line separator followed by the leading
whitespace of the line containing the selection head. It does not add an extra indentation
level; the explicit Indent action does that. Python indentation is four spaces for all
deterministic actions and literal-dictation fixtures in this proof of concept.

### OpenAI integration

- Keep `OPENAI_API_KEY` server-side.
- Make transcription and edit model identifiers configurable through environment variables.
- Use a short-lived credential endpoint for browser Realtime sessions.
- Use the OpenAI Responses API with strict structured output for AI edits.
- An edit response contains only a replacement string and a concise explanation; it cannot specify arbitrary files, commands, or ranges.
- Send only the challenge summary, current Python source, selection range, selected text, and spoken instruction needed for the targeted edit.
- Do not persist raw audio on the server.
- Provide deterministic mocked adapters so automated tests do not require an API key.

### Python execution

- Run Python in the browser with Pyodide inside a dedicated Web Worker.
- Execute only the current challenge's solution and bundled tests.
- Capture standard output, exceptions, and per-test pass/fail results.
- Terminate and recreate the worker when execution exceeds three seconds.
- Running code must not block microphone, editor, or other UI interactions.
- The test runner is a demo sandbox, not a security boundary for untrusted third-party code.

### Persistence

- Save solutions and the selected challenge to local storage.
- Never store API keys or short-lived Realtime credentials in local storage.
- A storage schema version must allow corrupted or obsolete state to fall back safely to starter content.

### PWA and accessibility

- Provide an installable web app manifest and application icons.
- Use touch targets of at least 44 by 44 CSS pixels for primary controls.
- Expose accessible names and status announcements for listening, transcribing, pending edits, test completion, and errors.
- Respect safe-area insets on iPhones.
- Do not rely on hover interactions.
- Keep the normal software keyboard usable as a fallback when the user taps the editor.

## Normative behavioral and test contracts

These contracts define observable behavior, not internal module structure. Automated tests
may use fakes for browser APIs, workers, Pyodide, and OpenAI, but assertions should be made at
the narrowest public boundary that proves each behavior.

### Realtime client lifecycle

The minimal client lifecycle is `idle -> connecting -> listening -> disconnecting -> idle`,
with `error` as a recoverable state. The following rules are normative:

- Connect is accepted only from `idle` or `error`. A repeated Connect while connecting or
  listening is a no-op and cannot request another credential, peer connection, or microphone
  stream.
- Disconnect is safe from every state. Repeated Disconnect is a no-op after resources have
  been released.
- Disconnect while Connect is pending invalidates that attempt. A late credential,
  permission, or negotiation result cannot transition the client to listening.
- Credential, permission, and negotiation failures release every resource acquired by that
  attempt, enter `error`, and expose an actionable message. A later Connect may retry.
- Disconnect stops every microphone track and closes the data channel and peer connection.
  No completed transcript callback may fire after Disconnect has completed.
- Only completed transcript items are emitted. A provider item identifier is emitted at most
  once even if the underlying event is delivered repeatedly.

### Editor actions and pending proposals

Ranges use zero-based, half-open document offsets even though spoken line numbers are
one-based. A range is valid only when `0 <= from <= to <= source.length`. Invalid action
ranges produce an error and do not change source, selection, pending proposal, or undo
history.

At minimum, action tests must prove these examples:

| Action | Initial state | Expected observable result |
| --- | --- | --- |
| Insert `X` at `[1, 1)` | source `abc` | source `aXbc`; cursor after `X`; one Undo restores `abc` |
| Replace `[1, 2)` with `X` | source `abc` | source `aXc`; replacement is one undoable transaction |
| Select `[0, 2)` | source `abc` | source unchanged; selection is `[0, 2)`; undo history unchanged |
| Delete selection `[1, 2)` | source `abc` | source `ac`; cursor at offset 1; one Undo restores `abc` |
| Indent at cursor 3 | source `  x` | source `      x`; cursor at offset 7; one Undo restores source and cursor |
| Outdent at cursor 7 | source `      x` | source `  x`; cursor at offset 3; one Undo restores source and cursor |
| Apply proposal `[1, 2) -> X` | source `abc`, matching captured source | source `aXc`; proposal cleared; one Undo restores `abc` exactly |
| Discard proposal | any unchanged live source | source unchanged; proposal cleared; undo history unchanged |
| Apply proposal after source changes | live source differs from captured source | visible stale-proposal error; source and proposal unchanged |
| Any action with `from > to` or an endpoint outside the document | any state | visible invalid-range error; all editor state unchanged |

A collapsed Indent or Outdent action changes the leading whitespace of the current line. A
non-collapsed action changes every line touched by the selection in one transaction. Indent
adds four spaces. Outdent removes up to four leading spaces and never removes non-whitespace.
Undo restores both source and selection, and Redo reapplies both. Run emits one run request
without changing source, selection, pending proposal, or editor history.

A proposal captures the complete source and replacement range used to request it. Apply is
allowed only while the current source exactly equals that captured source. Moving the
selection alone does not make a proposal stale. Apply replaces only the captured half-open
range. Discard never changes the document. Reset cancellation changes neither document nor
history; confirmed Reset restores starter source and clears pending proposals.

Challenge edits are retained per challenge in memory as soon as T-003 is implemented.
T-010 extends that behavior across reloads using versioned local storage.

### Literal Python dictation

Known spoken phrases are matched case-insensitively using longest-token-first matching, so
"less than or equal" is one token rather than `less than` followed by unknown words. Unknown
words remain in their original order and spelling after the leading `type` cue is removed.
Known `True`, `False`, and `None` tokens use Python casing.

The documented tokens have these literal meanings:

| Class | Spoken token | Emitted token |
| --- | --- | --- |
| punctuation | `colon`, `comma`, `dot` | `:`, `,`, `.` |
| punctuation | `open paren`, `close paren` | `(`, `)` |
| punctuation | `open bracket`, `close bracket` | `[`, `]` |
| punctuation | `open brace`, `close brace` | `{`, `}` |
| operator | `equals`, `double equals`, `not equals` | `=`, `==`, `!=` |
| operator | `less than`, `greater than` | `<`, `>` |
| operator | `less than or equal`, `greater than or equal` | `<=`, `>=` |
| operator | `plus`, `minus`, `times`, `divided by`, `modulo` | `+`, `-`, `*`, `/`, `%` |
| Python | `def`, `return`, `for`, `while`, `if`, `elif`, `else`, `in` | the same lowercase keyword |
| Python | `range`, `enumerate` | the same lowercase identifier |
| Python | `true`, `false`, `none` | `True`, `False`, `None` |
| layout | `new line`, `indent`, `dedent` | layout behavior described below; no literal word |

The normalizer uses conventional Python spacing: binary operators have one space on either
side; commas have no preceding space and one following space; colons and closing delimiters
have no preceding space; opening delimiters and dots have no following space; and a function
call has no space before its opening parenthesis. Layout tokens are not emitted as words.
`new line` emits a line separator, `indent` increases subsequent line indentation by four
spaces, and `dedent` reduces it by four spaces without going below the indentation active at
the insertion context.

The following fixtures are normative; expected strings are exact:

| Spoken text after `type` | Normalized Python |
| --- | --- |
| `return nums open bracket 0 close bracket` | `return nums[0]` |
| `if left less than or equal right colon` | `if left <= right:` |
| `result equals pair_sum open paren nums comma target close paren` | `result = pair_sum(nums, target)` |
| `for item in nums colon new line indent return item` | `for item in nums:\n    return item` |
| `if value double equals None colon new line indent return False new line dedent return True` | `if value == None:\n    return False\nreturn True` |

When inserted into an already-indented context, each emitted line begins at that context's
indentation, and spoken Indent or Dedent changes indentation relative to that baseline. The
entire normalized insertion is one undoable transaction.

### Python worker protocol and recovery

Every run has a request identifier, and every worker response includes that identifier.
Results distinguish these outcomes:

- `completed`: captured standard output, no runner exception, and a named list of individual
  tests whose status is `passed` or `failed`; an assertion failure is a failed test rather
  than a runner exception;
- `error`: captured output plus a structured exception containing at least its Python type
  and message; syntax errors and runtime failures outside an individual assertion use this
  outcome;
- `timeout`: the three-second limit elapsed, the old worker was terminated, and a replacement
  worker began its normal loading-to-ready lifecycle.

The UI ignores responses whose request identifier is not the currently active run, including
late responses from a timed-out or replaced worker. A run made after replacement reaches
ready must be able to complete normally. Worker tests use a passing solution, an assertion-
failing solution, a solution that prints, a syntax or runtime error, and an infinite loop.

### Completed-turn serialization

A completed transcript turn has a stable identifier. The application records that identifier
before routing it and never routes the same identifier again, whether the duplicate arrives
before, during, or after handling of the original.

Only one turn mutates application state at a time. Additional completed turns received while
an edit is being applied or tests are running are queued once in arrival order and handled
after the active operation completes, provided the voice session is still active. A Stop turn
or microphone-button stop takes priority: it ends the session, releases microphone resources,
clears queued turns, and prevents those turns from causing later mutations. After a non-Stop
turn finishes and the session remains active, the UI returns to listening.

## Suggested technical architecture

- Next.js App Router with TypeScript
- React client components for the editor, voice dock, diff review, and test results
- CodeMirror 6 for editing
- OpenAI JavaScript SDK in server-only route handlers
- OpenAI Realtime transcription over browser WebRTC
- OpenAI Responses API with strict structured output for targeted edits
- Pyodide in a module Web Worker for Python execution
- local storage for challenge progress
- Vitest and React Testing Library for unit/component tests
- Playwright with a WebKit mobile profile for automated UI verification

Suggested module boundaries:

```text
app/
  api/realtime-token/route.ts
  api/edit/route.ts
  page.tsx
components/
  ChallengePanel.tsx
  CodeEditor.tsx
  DiffReview.tsx
  TestResults.tsx
  VoiceDock.tsx
data/
  challenges.ts
lib/
  actions.ts
  persistence.ts
  voice/command-router.ts
  voice/python-dictation.ts
  voice/realtime-client.ts
  openai/edit-schema.ts
workers/
  python.worker.ts
```

These paths are guidance rather than an API contract. Keep domain logic outside React components and server credentials outside client bundles.

## Quality gates

After project bootstrap, every completed task must keep these commands passing:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`

UI tasks must additionally pass:

- `npm run test:e2e`
- manual verification at an iPhone-sized viewport

Before the demo, the primary flow must also be verified on the physical iPhone in Safari. Automated Playwright WebKit coverage does not replace this check.

## Non-goals

- A system-wide iOS keyboard
- A native iOS application
- A Codex plugin or remote-control client
- GitHub authentication or repository editing
- Arbitrary local filesystem access
- Multiple files per challenge
- Languages other than Python
- A terminal, shell, SSH connection, or server-side code runner
- Multi-file or autonomous agent edits
- User accounts, collaboration, or cloud sync
- Wake-word detection or background listening while the app is not active
- Fully offline transcription or AI editing
- A comprehensive LeetCode clone or ingestion of LeetCode content
- Production hardening for hostile code or multi-tenant execution

## Success criteria

The proof of concept is successful when:

- the rehearsed demo flow completes on the physical iPhone without typing;
- all required deterministic commands produce the expected CodeMirror transactions;
- literal dictation produces predictable Python for the documented vocabulary;
- AI output never changes code before explicit Apply;
- voice and touch controls produce identical actions;
- the bundled challenge tests execute without blocking the UI;
- a new developer can run the project from the public README without receiving private credentials;
- the repository contains no secrets or copyrighted third-party challenge text.

## Product risks and decisions

1. **iOS Realtime microphone behavior:** validate first on the target phone; retain the one-utterance fallback.
2. **Speech ambiguity:** require cue verbs and prefer a visible failure over a guessed mutation.
3. **Scope pressure:** protect the single-file, Python-only boundary.
4. **Pyodide startup time:** preload after the initial page becomes interactive and expose a clear runtime-ready state.
5. **Model latency or availability:** make model identifiers configurable and keep deterministic editing independent from AI edits.

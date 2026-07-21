import type { EditorAction, EditorActionState, TextRange } from "./editor-actions";
import { normalizePythonDictation } from "./python-dictation";

export type ControlCommand = "run" | "undo" | "redo" | "apply" | "discard" | "stopListening";

export type EditCommand =
  | { readonly type: "goToLine"; readonly line: number }
  | { readonly type: "selectLine"; readonly line: number }
  | { readonly type: "selectLines"; readonly fromLine: number; readonly toLine: number }
  | { readonly type: "indent" }
  | { readonly type: "outdent" }
  | { readonly type: "deleteSelection" }
  | { readonly type: "newLine" };

export type TranscriptRoute =
  | { readonly kind: "control"; readonly command: ControlCommand }
  | { readonly kind: "edit"; readonly command: EditCommand }
  | { readonly kind: "dictation"; readonly content: string }
  | { readonly kind: "ai"; readonly request: "write" | "change"; readonly instruction: string }
  | { readonly kind: "unknown" };

const controls: Record<string, ControlCommand> = {
  "run tests": "run",
  undo: "undo",
  redo: "redo",
  apply: "apply",
  discard: "discard",
  "stop listening": "stopListening",
};

const smallNumberWords: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const tensNumberWords: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const ordinalNumberWords: Readonly<Record<string, number>> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
  fortieth: 40,
  fiftieth: 50,
  sixtieth: 60,
  seventieth: 70,
  eightieth: 80,
  ninetieth: 90,
};

/** Normalizes only the comparison form. The caller retains the original transcript for display. */
export function normalizeTranscriptForRouting(transcript: string): string {
  return transcript.trim().replace(/\s+/g, " ").replace(/[.,!?]+$/, "").trim().toLowerCase();
}

/**
 * Classifies a completed transcript without changing editor state. Exact control and edit
 * grammar intentionally takes precedence over literal dictation and AI requests.
 */
export function routeTranscript(transcript: string): TranscriptRoute {
  const normalized = normalizeTranscriptForRouting(transcript);
  const control = controls[normalized];
  if (control) return { kind: "control", command: control };

  const lineCommand = normalized.match(/^go to line (.+)$/);
  if (lineCommand) {
    const line = parseSpokenLineNumber(lineCommand[1]);
    if (line !== undefined) return { kind: "edit", command: { type: "goToLine", line } };
  }

  const selectLinesCommand = normalized.match(/^select lines (.+) through (.+)$/);
  if (selectLinesCommand) {
    const fromLine = parseSpokenLineNumber(selectLinesCommand[1]);
    const toLine = parseSpokenLineNumber(selectLinesCommand[2]);
    if (fromLine !== undefined && toLine !== undefined) {
      return { kind: "edit", command: { type: "selectLines", fromLine, toLine } };
    }
  }

  const selectLineCommand = normalized.match(/^select line (.+)$/);
  if (selectLineCommand) {
    const line = parseSpokenLineNumber(selectLineCommand[1]);
    if (line !== undefined) return { kind: "edit", command: { type: "selectLine", line } };
  }

  if (normalized === "indent" || normalized === "indent once") return { kind: "edit", command: { type: "indent" } };
  if (normalized === "outdent" || normalized === "outdent once") return { kind: "edit", command: { type: "outdent" } };
  if (normalized === "delete selection") return { kind: "edit", command: { type: "deleteSelection" } };
  if (normalized === "new line") return { kind: "edit", command: { type: "newLine" } };

  if (normalized === "type" || normalized.startsWith("type ")) {
    return { kind: "dictation", content: removeCue(transcript, "type") };
  }
  if (normalized === "write" || normalized.startsWith("write ")) {
    return { kind: "ai", request: "write", instruction: removeCue(transcript, "write") };
  }
  if (normalized === "change" || normalized.startsWith("change ")) {
    return { kind: "ai", request: "change", instruction: removeCue(transcript, "change") };
  }

  return { kind: "unknown" };
}

/** Converts deterministic routes into the existing shared editor actions. */
export function editorActionForTranscriptRoute(
  route: TranscriptRoute,
  state: EditorActionState,
): EditorAction | undefined {
  if (route.kind === "control") {
    return controlAction(route.command);
  }
  if (route.kind === "dictation") {
    if (!validRange(state.source, state.selection)) return { type: "reportError", message: "Invalid range" };
    const text = normalizePythonDictation(route.content, indentationAtSelection(state));
    return text ? { type: "insert", range: state.selection, text } : undefined;
  }
  if (route.kind !== "edit") return undefined;

  switch (route.command.type) {
    case "goToLine": {
      const range = rangeForLine(state.source, route.command.line);
      return range ? { type: "select", range: { from: range.from, to: range.from } } : invalidLineRange();
    }
    case "selectLine": {
      const range = rangeForLine(state.source, route.command.line);
      return range ? { type: "select", range } : invalidLineRange();
    }
    case "selectLines": {
      if (route.command.fromLine > route.command.toLine) return invalidLineRange();
      const first = rangeForLine(state.source, route.command.fromLine);
      const last = rangeForLine(state.source, route.command.toLine);
      return first && last ? { type: "select", range: { from: first.from, to: last.to } } : invalidLineRange();
    }
    case "indent":
      return { type: "indent" };
    case "outdent":
      return { type: "outdent" };
    case "deleteSelection":
      return { type: "deleteSelection" };
    case "newLine":
      return newLineAction(state);
  }
}

export function describeTranscriptRoute(route: TranscriptRoute): string {
  if (route.kind === "unknown") return "I didn't understand that command.";
  if (route.kind === "dictation") return `Literal dictation: ${normalizePythonDictation(route.content)}`;
  if (route.kind === "ai") return route.request === "write" ? "AI write request" : "AI change request";
  if (route.kind === "control") return route.command === "run" ? "Run tests" : route.command;
  if (route.command.type === "selectLines") return `Select lines ${route.command.fromLine} through ${route.command.toLine}`;
  if (route.command.type === "selectLine") return `Select line ${route.command.line}`;
  if (route.command.type === "goToLine") return `Go to line ${route.command.line}`;
  return route.command.type === "newLine" ? "New line" : route.command.type;
}

function removeCue(transcript: string, cue: string): string {
  return transcript.trim().replace(new RegExp(`^${cue}(?:\\s+|$)`, "i"), "");
}

/** Parses only the bounded number slot in line commands; literal dictation remains untouched. */
function parseSpokenLineNumber(value: string): number | undefined {
  if (/^-?\d+$/.test(value)) return Number(value);

  const words = value.replace(/-/g, " ").trim().split(/\s+/);
  if (words.length === 1) {
    return smallNumberWords[words[0]] ?? tensNumberWords[words[0]] ?? ordinalNumberWords[words[0]];
  }
  if (words.length !== 2) return undefined;

  const tens = tensNumberWords[words[0]];
  const unit = smallNumberWords[words[1]] ?? ordinalNumberWords[words[1]];
  return tens !== undefined && unit !== undefined && unit >= 1 && unit <= 9 ? tens + unit : undefined;
}

function controlAction(command: ControlCommand): EditorAction | undefined {
  switch (command) {
    case "run": return { type: "run" };
    case "undo": return { type: "undo" };
    case "redo": return { type: "redo" };
    case "apply": return { type: "applyProposal" };
    case "discard": return { type: "discardProposal" };
    case "stopListening": return undefined;
  }
}

function rangeForLine(source: string, line: number): TextRange | undefined {
  if (!Number.isSafeInteger(line) || line < 1) return undefined;

  let from = 0;
  for (let currentLine = 1; currentLine < line; currentLine += 1) {
    const lineBreak = source.indexOf("\n", from);
    if (lineBreak === -1) return undefined;
    from = lineBreak + 1;
  }
  const lineBreak = source.indexOf("\n", from);
  return { from, to: lineBreak === -1 ? source.length : lineBreak };
}

function invalidLineRange(): EditorAction {
  return { type: "reportError", message: "Invalid line range" };
}

function newLineAction(state: EditorActionState): EditorAction {
  if (!validRange(state.source, state.selection)) return { type: "reportError", message: "Invalid range" };
  const lineStart = state.source.lastIndexOf("\n", Math.max(0, state.selection.to - 1)) + 1;
  const indentation = state.source.slice(lineStart).match(/^[ \t]*/)?.[0] ?? "";
  return { type: "insert", range: state.selection, text: `\n${indentation}` };
}

function validRange(source: string, range: TextRange): boolean {
  return range.from >= 0 && range.to >= range.from && range.to <= source.length;
}

function indentationAtSelection(state: EditorActionState): string {
  const lineStart = state.source.lastIndexOf("\n", Math.max(0, state.selection.to - 1)) + 1;
  return state.source.slice(lineStart).match(/^[ \t]*/)?.[0] ?? "";
}

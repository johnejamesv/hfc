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

  const lineCommand = normalized.match(/^go to line (-?\d+)$/);
  if (lineCommand) return { kind: "edit", command: { type: "goToLine", line: Number(lineCommand[1]) } };

  const selectLinesCommand = normalized.match(/^select lines (-?\d+) through (-?\d+)$/);
  if (selectLinesCommand) {
    return {
      kind: "edit",
      command: { type: "selectLines", fromLine: Number(selectLinesCommand[1]), toLine: Number(selectLinesCommand[2]) },
    };
  }

  const selectLineCommand = normalized.match(/^select line (-?\d+)$/);
  if (selectLineCommand) return { kind: "edit", command: { type: "selectLine", line: Number(selectLineCommand[1]) } };

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

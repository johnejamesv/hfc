export interface TextRange {
  readonly from: number;
  readonly to: number;
}

export interface PendingProposal {
  readonly capturedSource: string;
  readonly range: TextRange;
  readonly replacement: string;
  readonly explanation: string;
}

interface Snapshot {
  readonly source: string;
  readonly selection: TextRange;
}

export interface EditorActionState {
  readonly source: string;
  readonly selection: TextRange;
  readonly pendingProposal?: PendingProposal;
  readonly error?: string;
  readonly runRequests: number;
  readonly undoStack: readonly Snapshot[];
  readonly redoStack: readonly Snapshot[];
}

export type EditorAction =
  | { readonly type: "select"; readonly range: TextRange }
  | { readonly type: "insert"; readonly text: string; readonly range?: TextRange }
  | { readonly type: "deleteSelection" }
  | { readonly type: "indent" }
  | { readonly type: "outdent" }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "run" }
  | { readonly type: "setProposal"; readonly proposal: PendingProposal }
  | { readonly type: "applyProposal" }
  | { readonly type: "discardProposal" };

const INDENT = "    ";

export function createEditorActionState(source: string): EditorActionState {
  return { source, selection: { from: 0, to: 0 }, runRequests: 0, undoStack: [], redoStack: [] };
}

export function dispatchEditorAction(state: EditorActionState, action: EditorAction): EditorActionState {
  switch (action.type) {
    case "select":
      return validRange(state.source, action.range) ? { ...state, selection: action.range, error: undefined } : invalid(state);
    case "insert":
      return replaceRange(state, action.range ?? state.selection, action.text);
    case "deleteSelection":
      return replaceRange(state, state.selection, "");
    case "indent":
      return changeIndent(state, "indent");
    case "outdent":
      return changeIndent(state, "outdent");
    case "undo":
      return undo(state);
    case "redo":
      return redo(state);
    case "run":
      return { ...state, runRequests: state.runRequests + 1, error: undefined };
    case "setProposal":
      if (!validRange(action.proposal.capturedSource, action.proposal.range)) return invalid(state);
      return { ...state, pendingProposal: action.proposal, error: undefined };
    case "applyProposal":
      return applyProposal(state);
    case "discardProposal":
      return { ...state, pendingProposal: undefined, error: undefined };
  }
}

function validRange(source: string, range: TextRange): boolean {
  return range.from >= 0 && range.to >= range.from && range.to <= source.length;
}

function invalid(state: EditorActionState, error = "Invalid range"): EditorActionState {
  return { ...state, error };
}

function replaceRange(state: EditorActionState, range: TextRange, replacement: string): EditorActionState {
  if (!validRange(state.source, range)) return invalid(state);
  const source = state.source.slice(0, range.from) + replacement + state.source.slice(range.to);
  const cursor = range.from + replacement.length;
  return commit(state, source, { from: cursor, to: cursor });
}

function commit(state: EditorActionState, source: string, selection: TextRange): EditorActionState {
  return {
    ...state,
    source,
    selection,
    error: undefined,
    undoStack: [...state.undoStack, { source: state.source, selection: state.selection }],
    redoStack: [],
  };
}

function undo(state: EditorActionState): EditorActionState {
  const previous = state.undoStack.at(-1);
  if (!previous) return { ...state, error: undefined };
  return {
    ...state,
    source: previous.source,
    selection: previous.selection,
    error: undefined,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, { source: state.source, selection: state.selection }],
  };
}

function redo(state: EditorActionState): EditorActionState {
  const next = state.redoStack.at(-1);
  if (!next) return { ...state, error: undefined };
  return {
    ...state,
    source: next.source,
    selection: next.selection,
    error: undefined,
    undoStack: [...state.undoStack, { source: state.source, selection: state.selection }],
    redoStack: state.redoStack.slice(0, -1),
  };
}

function lineStart(source: string, offset: number): number {
  return source.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

function lineEnd(source: string, offset: number): number {
  const end = source.indexOf("\n", offset);
  return end === -1 ? source.length : end;
}

function touchedLineStarts(source: string, selection: TextRange): number[] {
  const starts: number[] = [];
  let current = lineStart(source, selection.from);
  const final = lineEnd(source, selection.to === selection.from ? selection.to : Math.max(selection.from, selection.to - 1));
  while (current <= final) {
    starts.push(current);
    const nextBreak = source.indexOf("\n", current);
    if (nextBreak === -1 || nextBreak >= final) break;
    current = nextBreak + 1;
  }
  return starts;
}

function changeIndent(state: EditorActionState, mode: "indent" | "outdent"): EditorActionState {
  if (!validRange(state.source, state.selection)) return invalid(state);
  const starts = touchedLineStarts(state.source, state.selection);
  let source = state.source;
  let fromDelta = 0;
  let toDelta = 0;

  for (let index = starts.length - 1; index >= 0; index -= 1) {
    const start = starts[index];
    const delta = mode === "indent" ? INDENT.length : -countOutdent(source, start);
    if (delta === 0) continue;
    source = delta > 0
      ? source.slice(0, start) + INDENT + source.slice(start)
      : source.slice(0, start) + source.slice(start - delta);
    if (start <= state.selection.from) fromDelta += delta;
    if (start < state.selection.to || state.selection.from === state.selection.to) toDelta += delta;
  }

  return commit(state, source, {
    from: Math.max(0, state.selection.from + fromDelta),
    to: Math.max(0, state.selection.to + toDelta),
  });
}

function countOutdent(source: string, start: number): number {
  let count = 0;
  while (count < INDENT.length && source[start + count] === " ") count += 1;
  return count;
}

function applyProposal(state: EditorActionState): EditorActionState {
  const proposal = state.pendingProposal;
  if (!proposal) return { ...state, error: "No pending proposal" };
  if (state.source !== proposal.capturedSource) return invalid(state, "Pending proposal is stale");
  const next = replaceRange(state, proposal.range, proposal.replacement);
  return { ...next, pendingProposal: undefined };
}

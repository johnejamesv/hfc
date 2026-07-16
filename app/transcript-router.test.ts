import { describe, expect, it } from "vitest";
import { createEditorActionState, dispatchEditorAction, type EditorActionState } from "./editor-actions";
import {
  editorActionForTranscriptRoute,
  normalizeTranscriptForRouting,
  routeTranscript,
} from "./transcript-router";

describe("transcript router", () => {
  it("normalizes comparison text without changing the raw transcript", () => {
    expect(normalizeTranscriptForRouting("  Select   Line  2?!  ")).toBe("select line 2");
    expect(routeTranscript("  Select   Line  2?!  ")).toEqual({
      kind: "edit",
      command: { type: "selectLine", line: 2 },
    });
  });

  it.each([
    ["run tests", { kind: "control", command: "run" }],
    ["undo", { kind: "control", command: "undo" }],
    ["redo", { kind: "control", command: "redo" }],
    ["apply", { kind: "control", command: "apply" }],
    ["discard", { kind: "control", command: "discard" }],
    ["stop listening", { kind: "control", command: "stopListening" }],
    ["go to line 3", { kind: "edit", command: { type: "goToLine", line: 3 } }],
    ["select line 3", { kind: "edit", command: { type: "selectLine", line: 3 } }],
    ["select lines 2 through 3", { kind: "edit", command: { type: "selectLines", fromLine: 2, toLine: 3 } }],
    ["indent", { kind: "edit", command: { type: "indent" } }],
    ["indent once", { kind: "edit", command: { type: "indent" } }],
    ["outdent", { kind: "edit", command: { type: "outdent" } }],
    ["outdent once", { kind: "edit", command: { type: "outdent" } }],
    ["delete selection", { kind: "edit", command: { type: "deleteSelection" } }],
    ["new line", { kind: "edit", command: { type: "newLine" } }],
  ])("routes exact deterministic grammar: %s", (transcript, expected) => {
    expect(routeTranscript(transcript)).toEqual(expected);
  });

  it("reserves type, write, and change for later deterministic dictation or AI work", () => {
    expect(routeTranscript("Type  MyVariable")).toEqual({ kind: "dictation", content: "MyVariable" });
    expect(routeTranscript("write a loop over nums")).toEqual({
      kind: "ai",
      request: "write",
      instruction: "a loop over nums",
    });
    expect(routeTranscript("change this loop")).toEqual({ kind: "ai", request: "change", instruction: "this loop" });
  });

  it.each([
    "please run tests",
    "run tests now",
    "select the line 2",
    "select lines 2 to 3",
    "indent twice",
    "delete the selection",
    "new blank line",
    "writeup a loop",
    "typewriter",
  ])("keeps added words and unsupported synonyms unknown: %s", (transcript) => {
    expect(routeTranscript(transcript)).toEqual({ kind: "unknown" });
  });
});

describe("routed editor actions", () => {
  const source = "one\ntwo\nthree";

  function stateWithSelection(selection = { from: 0, to: 0 }): EditorActionState {
    return dispatchEditorAction(createEditorActionState(source), { type: "select", range: selection });
  }

  it("uses one-based, inclusive line semantics while excluding line separators", () => {
    expect(editorActionForTranscriptRoute(routeTranscript("go to line 1"), stateWithSelection())).toEqual({
      type: "select",
      range: { from: 0, to: 0 },
    });
    expect(editorActionForTranscriptRoute(routeTranscript("select line 3"), stateWithSelection())).toEqual({
      type: "select",
      range: { from: 8, to: 13 },
    });
    expect(editorActionForTranscriptRoute(routeTranscript("select lines 2 through 3"), stateWithSelection())).toEqual({
      type: "select",
      range: { from: 4, to: 13 },
    });
  });

  it.each(["go to line 0", "go to line -1", "select lines 3 through 2", "select line 4"]) (
    "reports invalid line input without changing source or selection: %s",
    (transcript) => {
      const before = stateWithSelection({ from: 4, to: 7 });
      const action = editorActionForTranscriptRoute(routeTranscript(transcript), before);
      expect(action).toEqual({ type: "reportError", message: "Invalid line range" });
      const after = dispatchEditorAction(before, action!);
      expect(after.source).toBe(before.source);
      expect(after.selection).toEqual(before.selection);
      expect(after.undoStack).toEqual(before.undoStack);
      expect(after.error).toBe("Invalid line range");
    },
  );

  it("maps recognized controls, edits, and literal dictation to the shared dispatcher", () => {
    const before = stateWithSelection({ from: 3, to: 3 });
    expect(editorActionForTranscriptRoute(routeTranscript("run tests"), before)).toEqual({ type: "run" });
    expect(editorActionForTranscriptRoute(routeTranscript("indent once"), before)).toEqual({ type: "indent" });
    expect(editorActionForTranscriptRoute(routeTranscript("type return one"), before)).toEqual({
      type: "insert",
      range: { from: 3, to: 3 },
      text: "return one",
    });
    expect(editorActionForTranscriptRoute(routeTranscript("write a function"), before)).toBeUndefined();
  });

  it("inserts dictation with the current line indentation in one undoable action", () => {
    const before = dispatchEditorAction(createEditorActionState("  pass"), {
      type: "select",
      range: { from: 0, to: 6 },
    });
    const action = editorActionForTranscriptRoute(
      routeTranscript("type for item in nums colon new line indent return item"),
      before,
    );
    expect(action).toEqual({
      type: "insert",
      range: { from: 0, to: 6 },
      text: "  for item in nums:\n      return item",
    });
    const after = dispatchEditorAction(before, action!);
    expect(after.source).toBe("  for item in nums:\n      return item");
    expect(dispatchEditorAction(after, { type: "undo" }).source).toBe("  pass");
  });

  it("inserts a newline with the current line indentation as one shared action", () => {
    const before = dispatchEditorAction(createEditorActionState("  return value"), {
      type: "select",
      range: { from: 14, to: 14 },
    });
    const action = editorActionForTranscriptRoute(routeTranscript("new line"), before);
    expect(action).toEqual({ type: "insert", range: { from: 14, to: 14 }, text: "\n  " });
    expect(dispatchEditorAction(before, action!)).toMatchObject({ source: "  return value\n  ", selection: { from: 17, to: 17 } });
  });
});

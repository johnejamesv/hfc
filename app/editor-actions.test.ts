import { describe, expect, it } from "vitest";
import { createEditorActionState, dispatchEditorAction, type EditorActionState } from "./editor-actions";

function apply(state: EditorActionState, type: Parameters<typeof dispatchEditorAction>[1]) {
  return dispatchEditorAction(state, type);
}

describe("editor action model", () => {
  it("inserts text as one undoable transaction", () => {
    const state = apply(createEditorActionState("abc"), { type: "insert", text: "X", range: { from: 1, to: 1 } });
    expect(state.source).toBe("aXbc");
    expect(state.selection).toEqual({ from: 2, to: 2 });
    expect(apply(state, { type: "undo" }).source).toBe("abc");
  });

  it("replaces and deletes ranges as one undoable transaction", () => {
    const replaced = apply(createEditorActionState("abc"), { type: "insert", text: "X", range: { from: 1, to: 2 } });
    expect(replaced.source).toBe("aXc");
    expect(apply(replaced, { type: "undo" }).source).toBe("abc");

    const selected = apply(createEditorActionState("abc"), { type: "select", range: { from: 1, to: 2 } });
    expect(selected.undoStack).toHaveLength(0);
    const deleted = apply(selected, { type: "deleteSelection" });
    expect(deleted.source).toBe("ac");
    expect(deleted.selection).toEqual({ from: 1, to: 1 });
    expect(apply(deleted, { type: "undo" }).source).toBe("abc");
  });

  it("indents and outdents touched lines while preserving undo and redo", () => {
    const indented = apply(apply(createEditorActionState("  x"), { type: "select", range: { from: 3, to: 3 } }), { type: "indent" });
    expect(indented.source).toBe("      x");
    expect(indented.selection).toEqual({ from: 7, to: 7 });

    const undone = apply(indented, { type: "undo" });
    expect(undone.source).toBe("  x");
    expect(undone.selection).toEqual({ from: 3, to: 3 });
    expect(apply(undone, { type: "redo" }).source).toBe("      x");

    const outdented = apply(apply(createEditorActionState("      x"), { type: "select", range: { from: 7, to: 7 } }), { type: "outdent" });
    expect(outdented.source).toBe("  x");
    expect(outdented.selection).toEqual({ from: 3, to: 3 });
    expect(apply(outdented, { type: "undo" }).source).toBe("      x");
  });

  it("applies and discards pending proposals separately from live source", () => {
    const proposal = { capturedSource: "abc", range: { from: 1, to: 2 }, replacement: "X", explanation: "Use X." };
    const proposed = apply(createEditorActionState("abc"), { type: "setProposal", proposal });
    const applied = apply(proposed, { type: "applyProposal" });
    expect(applied.source).toBe("aXc");
    expect(applied.pendingProposal).toBeUndefined();
    expect(apply(applied, { type: "undo" }).source).toBe("abc");

    const discarded = apply(proposed, { type: "discardProposal" });
    expect(discarded.source).toBe("abc");
    expect(discarded.pendingProposal).toBeUndefined();
    expect(discarded.undoStack).toHaveLength(0);
  });

  it("rejects stale proposals, invalid ranges, and run mutations", () => {
    const proposal = { capturedSource: "abc", range: { from: 1, to: 2 }, replacement: "X", explanation: "Use X." };
    const edited = apply(apply(createEditorActionState("abc"), { type: "setProposal", proposal }), {
      type: "insert",
      text: "!",
      range: { from: 3, to: 3 },
    });
    const stale = apply(edited, { type: "applyProposal" });
    expect(stale.source).toBe("abc!");
    expect(stale.pendingProposal).toEqual(proposal);
    expect(stale.error).toMatch(/stale/i);

    const invalid = apply(createEditorActionState("abc"), { type: "insert", text: "X", range: { from: 2, to: 1 } });
    expect(invalid.source).toBe("abc");
    expect(invalid.selection).toEqual({ from: 0, to: 0 });
    expect(invalid.undoStack).toHaveLength(0);

    const run = apply(createEditorActionState("abc"), { type: "run" });
    expect(run.source).toBe("abc");
    expect(run.selection).toEqual({ from: 0, to: 0 });
    expect(run.undoStack).toHaveLength(0);
    expect(run.runRequests).toBe(1);
  });
});

"use client";

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { defaultHighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { EditorSelection, EditorState, Transaction } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

interface CodeEditorProps {
  readonly value: string;
  readonly selection?: { readonly from: number; readonly to: number };
  readonly onChange: (value: string) => void;
  readonly onSelectionChange?: (selection: { readonly from: number; readonly to: number }) => void;
  readonly ariaLabel?: string;
}

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "#d9e8e3",
    fontSize: "0.84rem",
    minHeight: "12rem",
  },
  "&.cm-focused": { outline: "2px solid #6fffc1", outlineOffset: "-2px" },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    lineHeight: "1.65",
    overflow: "auto",
    WebkitOverflowScrolling: "touch",
  },
  ".cm-content": { caretColor: "#6fffc1", minWidth: "max-content", padding: "0.8rem 0" },
  ".cm-line": { padding: "0 0.8rem" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#6fffc1" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "#315a4e !important",
  },
  ".cm-gutters": {
    backgroundColor: "#0b1916",
    color: "#6f8880",
    borderRight: "1px solid #29423b",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "#172b2688" },
});

export function CodeEditor({ value, selection, onChange, onSelectionChange, ariaLabel = "Python code editor" }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const onChangeRef = useRef(onChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const initialValue = useRef(value);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSelectionChangeRef.current = onSelectionChange;
  }, [onChange, onSelectionChange]);

  useEffect(() => {
    if (!host.current) {
      return;
    }

    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          EditorState.tabSize.of(4),
          indentUnit.of("    "),
          python(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.contentAttributes.of({ "aria-label": ariaLabel, spellcheck: "false" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
            if (update.selectionSet) {
              const range = update.state.selection.main;
              onSelectionChangeRef.current?.({ from: range.from, to: range.to });
            }
          }),
          editorTheme,
        ],
      }),
    });

    view.current = editor;

    return () => {
      view.current = null;
      editor.destroy();
    };
  }, [ariaLabel]);

  useEffect(() => {
    const editor = view.current;

    if (!editor || editor.state.doc.toString() === value) {
      return;
    }

    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: value },
      annotations: Transaction.addToHistory.of(false),
    });
  }, [value]);

  useEffect(() => {
    const editor = view.current;

    if (!editor || !selection) {
      return;
    }

    const current = editor.state.selection.main;
    if (current.from === selection.from && current.to === selection.to) {
      return;
    }

    editor.dispatch({
      selection: EditorSelection.range(selection.from, selection.to),
      annotations: Transaction.addToHistory.of(false),
    });
  }, [selection]);

  return <div className="code-editor" ref={host} />;
}

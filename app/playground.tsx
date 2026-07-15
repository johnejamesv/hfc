"use client";

import { useCallback, useState } from "react";
import { challenges, getChallenge, type ChallengeId } from "./challenges";
import { CodeEditor } from "./code-editor";
import { createEditorActionState, dispatchEditorAction, type EditorAction, type EditorActionState, type TextRange } from "./editor-actions";
import { PythonTestRunner } from "./python-test-runner";
import { VoiceSession } from "./voice-session";
import { describeTranscriptRoute, editorActionForTranscriptRoute, routeTranscript, type TranscriptRoute } from "./transcript-router";
import type { CompletedTranscript } from "./realtime-transcription-client";

type VoiceMode = "realtime" | "recording";
type ChallengeEditorStates = Record<ChallengeId, EditorActionState>;
type EditorRevisions = Record<ChallengeId, number>;
type LastTranscript = { readonly text: string; readonly interpretation: string };

function createInitialEditorStates(): ChallengeEditorStates {
  return challenges.reduce<ChallengeEditorStates>((states, challenge) => {
    states[challenge.id] = createEditorActionState(challenge.starterCode);
    return states;
  }, {} as ChallengeEditorStates);
}

function createInitialRevisions(): EditorRevisions {
  return challenges.reduce<EditorRevisions>((revisions, challenge) => {
    revisions[challenge.id] = 0;
    return revisions;
  }, {} as EditorRevisions);
}

export function Playground({ voiceMode }: { readonly voiceMode: VoiceMode }) {
  const [selectedId, setSelectedId] = useState<ChallengeId>(challenges[0].id);
  const [editorStates, setEditorStates] = useState<ChallengeEditorStates>(createInitialEditorStates);
  const [editorRevisions, setEditorRevisions] = useState<EditorRevisions>(createInitialRevisions);
  const [lastTranscript, setLastTranscript] = useState<LastTranscript>();
  const challenge = getChallenge(selectedId);
  const editorState = editorStates[selectedId];

  const dispatchAction = useCallback((action: EditorAction) => {
    setEditorStates((current) => ({
      ...current,
      [selectedId]: dispatchEditorAction(current[selectedId], action),
    }));
  }, [selectedId]);

  const updateSource = useCallback((source: string) => {
    setEditorStates((current) => ({
      ...current,
      [selectedId]: { ...current[selectedId], source, error: undefined },
    }));
  }, [selectedId]);

  const updateSelection = useCallback((selection: TextRange) => {
    setEditorStates((current) => ({
      ...current,
      [selectedId]: dispatchEditorAction(current[selectedId], { type: "select", range: selection }),
    }));
  }, [selectedId]);

  const handleCompletedTranscript = useCallback((transcript: CompletedTranscript): TranscriptRoute => {
    const route = routeTranscript(transcript.text);
    setLastTranscript({ text: transcript.text, interpretation: describeTranscriptRoute(route) });
    setEditorStates((current) => {
      const action = editorActionForTranscriptRoute(route, current[selectedId]);
      if (!action) return current;
      return { ...current, [selectedId]: dispatchEditorAction(current[selectedId], action) };
    });
    return route;
  }, [selectedId]);

  const resetSource = () => {
    const confirmed = window.confirm(
      `Reset ${challenge.title} to its starter code? Your edits for this challenge will be lost.`,
    );

    if (!confirmed) {
      return;
    }

    setEditorStates((current) => ({ ...current, [selectedId]: createEditorActionState(challenge.starterCode) }));
    setEditorRevisions((current) => ({ ...current, [selectedId]: current[selectedId] + 1 }));
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="HFC home">
          <span className="brand-mark" aria-hidden="true">H</span>
          <span>HFC</span>
        </div>
        <span className="session-state">Ready</span>
      </header>

      <section className="challenge-card" aria-labelledby="challenge-title">
        <div className="challenge-picker">
          <label htmlFor="challenge-select">Challenge</label>
          <select
            id="challenge-select"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value as ChallengeId)}
          >
            {challenges.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}{candidate.isDemo ? " · Demo" : ""}
              </option>
            ))}
          </select>
        </div>
        <p className="eyebrow">{challenge.isDemo ? "Demo challenge" : "Practice challenge"} · Python</p>
        <h1 id="challenge-title">{challenge.title}</h1>
        <p>{challenge.prompt}</p>
        <div className="examples" aria-label="Examples">
          {challenge.examples.map((example) => (
            <div className="example" key={`${example.input}-${example.output}`}>
              <span>{example.input}</span>
              <span>→ {example.output}</span>
              {example.note ? <small>{example.note}</small> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="editor-panel" aria-labelledby="editor-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Virtual file</p>
            <h2 id="editor-title">solution.py</h2>
          </div>
          <div className="editor-tools">
            <span className="language-badge">Python</span>
            <button type="button" className="reset-button" onClick={resetSource}>Reset</button>
          </div>
        </div>
        <CodeEditor
          key={`${selectedId}-${editorRevisions[selectedId]}`}
          value={editorState.source}
          selection={editorState.selection}
          onChange={updateSource}
          onSelectionChange={updateSelection}
        />
      </section>

      {editorState.error ? <p className="action-error" role="alert">{editorState.error}</p> : null}

      <PythonTestRunner
        challenge={challenge}
        source={editorState.source}
        runRequests={editorState.runRequests}
      />

      <VoiceSession
        mode={voiceMode}
        onUndo={() => dispatchAction({ type: "undo" })}
        onRedo={() => dispatchAction({ type: "redo" })}
        onRun={() => dispatchAction({ type: "run" })}
        onApply={() => dispatchAction({ type: "applyProposal" })}
        onDiscard={() => dispatchAction({ type: "discardProposal" })}
        canUndo={editorState.undoStack.length > 0}
        canRedo={editorState.redoStack.length > 0}
        hasPendingProposal={Boolean(editorState.pendingProposal)}
        lastTranscript={lastTranscript}
        onCompletedTranscript={handleCompletedTranscript}
      />
    </main>
  );
}

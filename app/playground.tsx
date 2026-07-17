"use client";

import { useCallback, useRef, useState } from "react";
import { challenges, getChallenge, type ChallengeId } from "./challenges";
import { CodeEditor } from "./code-editor";
import { createEditorActionState, dispatchEditorAction, type EditorAction, type EditorActionState, type TextRange } from "./editor-actions";
import { requestEditProposal } from "./ai-edit-client";
import type { EditRequestKind } from "./ai-edit-protocol";
import { ProposalReview } from "./proposal-review";
import { PythonTestRunner } from "./python-test-runner";
import { VoiceSession } from "./voice-session";
import { describeTranscriptRoute, editorActionForTranscriptRoute, routeTranscript, type TranscriptRoute } from "./transcript-router";
import type { CompletedTranscript } from "./realtime-transcription-client";
import { CompletedTurnQueue, type CompletedTurnReceipt } from "./completed-turn-queue";

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
  const [isRequestingProposal, setIsRequestingProposal] = useState(false);
  const [runAnnouncement, setRunAnnouncement] = useState<string>();
  const editorStatesRef = useRef(editorStates);
  const selectedIdRef = useRef(selectedId);
  const proposalInFlight = useRef(false);
  const runInFlight = useRef(false);
  const runWaiters = useRef(new Map<number, () => void>());
  const turnHandler = useRef<(turn: { readonly transcript: CompletedTranscript; readonly route: TranscriptRoute }) => Promise<void>>(async () => undefined);
  const turnQueue = useRef<CompletedTurnQueue<TranscriptRoute> | undefined>(undefined);
  const challenge = getChallenge(selectedId);
  const editorState = editorStates[selectedId];

  if (!turnQueue.current) {
    turnQueue.current = new CompletedTurnQueue({
      classify: (transcript) => routeTranscript(transcript.text),
      canProcess: () => !proposalInFlight.current && !runInFlight.current,
      isStop: (route) => route.kind === "control" && route.command === "stopListening",
      onTurn: (turn) => turnHandler.current(turn),
    });
    turnQueue.current.start();
  }

  const updateChallengeState = useCallback((id: ChallengeId, update: (state: EditorActionState) => EditorActionState) => {
    const next = { ...editorStatesRef.current, [id]: update(editorStatesRef.current[id]) };
    editorStatesRef.current = next;
    setEditorStates(next);
  }, []);

  const markRunStarted = useCallback(() => {
    runInFlight.current = true;
    setRunAnnouncement("Tests running.");
  }, []);

  const dispatchAction = useCallback((action: EditorAction, id = selectedIdRef.current) => {
    if (action.type === "run") markRunStarted();
    updateChallengeState(id, (state) => dispatchEditorAction(state, action));
  }, [markRunStarted, updateChallengeState]);

  const updateSource = useCallback((source: string) => {
    const id = selectedIdRef.current;
    updateChallengeState(id, (state) => ({ ...state, source, error: undefined }));
  }, [updateChallengeState]);

  const updateSelection = useCallback((selection: TextRange) => {
    const id = selectedIdRef.current;
    dispatchAction({ type: "select", range: selection }, id);
  }, [dispatchAction]);

  const requestProposal = useCallback(async (kind: EditRequestKind, instruction: string) => {
    const capturedId = selectedIdRef.current;
    const capturedState = editorStatesRef.current[capturedId];
    const capturedChallenge = getChallenge(capturedId);
    if (kind === "change" && capturedState.selection.from === capturedState.selection.to) {
      updateChallengeState(capturedId, (state) =>
        dispatchEditorAction(state, {
          type: "reportError",
          message: "Select code before asking HFC to change it.",
        }),
      );
      return;
    }
    if (!instruction.trim()) {
      updateChallengeState(capturedId, (state) =>
        dispatchEditorAction(state, {
          type: "reportError",
          message: "Describe the requested edit in a short phrase.",
        }),
      );
      return;
    }

    proposalInFlight.current = true;
    setIsRequestingProposal(true);
    try {
      const proposal = await requestEditProposal({
        kind,
        instruction,
        challengeSummary: capturedChallenge.summary,
        source: capturedState.source,
        range: capturedState.selection,
      });
      updateChallengeState(capturedId, (state) =>
        dispatchEditorAction(state, {
          type: "setProposal",
          proposal: {
            capturedSource: capturedState.source,
            range: capturedState.selection,
            replacement: proposal.replacement,
            explanation: proposal.explanation,
          },
        }),
      );
      setLastTranscript((current) => current ? {
        ...current,
        interpretation: `AI proposal ready: ${proposal.explanation}`,
      } : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The edit request could not be completed. Please try again.";
      updateChallengeState(capturedId, (state) => dispatchEditorAction(state, { type: "reportError", message }));
    } finally {
      proposalInFlight.current = false;
      setIsRequestingProposal(false);
      turnQueue.current?.resume();
    }
  }, [updateChallengeState]);

  const runFromVoice = useCallback(() => {
    const id = selectedIdRef.current;
    const requestId = editorStatesRef.current[id].runRequests + 1;
    return new Promise<void>((resolve) => {
      runWaiters.current.set(requestId, resolve);
      dispatchAction({ type: "run" }, id);
    });
  }, [dispatchAction]);

  turnHandler.current = async ({ transcript, route }) => {
    setLastTranscript({ text: transcript.text, interpretation: describeTranscriptRoute(route) });
    if (route.kind === "ai") {
      await requestProposal(route.request, route.instruction);
      return;
    }
    if (route.kind === "control" && route.command === "run") {
      await runFromVoice();
      return;
    }
    const id = selectedIdRef.current;
    const action = editorActionForTranscriptRoute(route, editorStatesRef.current[id]);
    if (action) dispatchAction(action, id);
  };

  const handleCompletedTranscript = useCallback((transcript: CompletedTranscript): CompletedTurnReceipt<TranscriptRoute> => {
    return turnQueue.current!.enqueue(transcript);
  }, []);

  const handleSessionActiveChange = useCallback((active: boolean) => {
    if (active) turnQueue.current?.start();
    else turnQueue.current?.stop();
  }, []);

  const handleRunStarted = useCallback(() => {
    markRunStarted();
  }, [markRunStarted]);

  const handleRunFinished = useCallback((requestId: number) => {
    runInFlight.current = false;
    setRunAnnouncement("Test run completed.");
    runWaiters.current.get(requestId)?.();
    runWaiters.current.delete(requestId);
    turnQueue.current?.resume();
  }, []);

  const resetSource = () => {
    const confirmed = window.confirm(
      `Reset ${challenge.title} to its starter code? Your edits for this challenge will be lost.`,
    );

    if (!confirmed) {
      return;
    }

    updateChallengeState(selectedId, () => createEditorActionState(challenge.starterCode));
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
            onChange={(event) => {
              const nextId = event.target.value as ChallengeId;
              selectedIdRef.current = nextId;
              setSelectedId(nextId);
            }}
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

      {isRequestingProposal ? <p className="proposal-status" role="status">Creating AI proposal…</p> : null}
      {editorState.pendingProposal ? <p role="status">AI proposal ready to review.</p> : null}
      {editorState.pendingProposal ? (
        <ProposalReview
          proposal={editorState.pendingProposal}
          onApply={() => dispatchAction({ type: "applyProposal" })}
          onDiscard={() => dispatchAction({ type: "discardProposal" })}
        />
      ) : null}

      <PythonTestRunner
        challenge={challenge}
        source={editorState.source}
        runRequests={editorState.runRequests}
        onRunStarted={handleRunStarted}
        onRunFinished={handleRunFinished}
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
        onSessionActiveChange={handleSessionActiveChange}
        announcement={runAnnouncement}
      />
    </main>
  );
}

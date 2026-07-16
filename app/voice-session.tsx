"use client";

import { useEffect, useRef, useState } from "react";
import {
  type CompletedTranscript,
  RealtimeTranscriptionClient,
  type RealtimeSessionState,
} from "./realtime-transcription-client";
import { MediaRecorderTranscriptionClient } from "./media-recorder-transcription-client";
import type { TranscriptRoute } from "./transcript-router";

const statusCopy: Record<RealtimeSessionState, string> = {
  idle: "Tap the microphone when you’re ready to code.",
  connecting: "Connecting to the microphone…",
  listening: "Listening for your next command…",
  disconnecting: "Stopping the microphone…",
  transcribing: "Transcribing your recorded phrase…",
  error: "Voice transcription needs attention.",
};

type VoiceMode = "realtime" | "recording";
type VoiceClient = Pick<RealtimeTranscriptionClient, "connect" | "disconnect" | "dispose">;

interface VoiceSessionProps {
  readonly mode?: VoiceMode;
  readonly onUndo?: () => void;
  readonly onRedo?: () => void;
  readonly onRun?: () => void;
  readonly onApply?: () => void;
  readonly onDiscard?: () => void;
  readonly canUndo?: boolean;
  readonly canRedo?: boolean;
  readonly hasPendingProposal?: boolean;
  readonly lastTranscript?: { readonly text: string; readonly interpretation: string };
  readonly onCompletedTranscript?: (transcript: CompletedTranscript) => TranscriptRoute;
}

export function VoiceSession({
  mode = "realtime",
  onUndo,
  onRedo,
  onRun,
  onApply,
  onDiscard,
  canUndo = false,
  canRedo = false,
  hasPendingProposal = false,
  lastTranscript,
  onCompletedTranscript,
}: VoiceSessionProps) {
  const client = useRef<VoiceClient | null>(null);
  const [state, setState] = useState<RealtimeSessionState>("idle");
  const [error, setError] = useState<string>();
  const [transcripts, setTranscripts] = useState<CompletedTranscript[]>([]);

  useEffect(() => {
    const Client = mode === "recording" ? MediaRecorderTranscriptionClient : RealtimeTranscriptionClient;
    const transcriptionClient = new Client({
      onStateChange: (nextState, nextError) => {
        setState(nextState);
        setError(nextError);
      },
      onTranscript: (transcript) => {
        setTranscripts((current) => [transcript, ...current].slice(0, 3));
        const route = onCompletedTranscript?.(transcript);
        if (route?.kind === "control" && route.command === "stopListening") {
          transcriptionClient.disconnect();
        }
      },
    });
    client.current = transcriptionClient;

    return () => transcriptionClient.dispose();
  }, [mode, onCompletedTranscript]);

  const toggleListening = () => {
    if (state === "listening" || state === "connecting") {
      client.current?.disconnect();
      return;
    }

    void client.current?.connect();
  };

  const isListening = state === "listening" || state === "connecting";
  const isTranscribing = state === "transcribing" || state === "disconnecting";
  const microphoneLabel = isListening
    ? mode === "recording"
      ? "Finish recording"
      : "Stop listening"
    : mode === "recording"
      ? "Record one phrase"
      : "Start listening";

  return (
    <>
      <section className="transcript" aria-live="polite" aria-label="Voice transcript status">
        <span className="pulse" aria-hidden="true" />
        <div>
          <p className="eyebrow">Voice session · {state}</p>
          <p>{error ?? statusCopy[state]}</p>
          {lastTranscript ? (
            <p className="transcript-interpretation">
              Heard: {lastTranscript.text} · Interpreted: {lastTranscript.interpretation}
            </p>
          ) : null}
          {transcripts.length > 0 ? (
            <ol className="completed-transcripts" aria-label="Completed transcripts">
              {transcripts.map((transcript) => (
                <li key={transcript.id}>{transcript.text}</li>
              ))}
            </ol>
          ) : null}
          <details className="dictation-help">
            <summary>Literal dictation vocabulary</summary>
            <p>Start with “type”. Say colon, comma, dot, open or close paren, bracket, or brace; equals, comparisons, arithmetic operators; Python keywords; true, false, none; and new line, indent, or dedent.</p>
          </details>
        </div>
      </section>

      <nav className="control-dock" aria-label="Editor controls">
        <button type="button" className="dock-button" aria-label="Undo" onClick={onUndo} disabled={!canUndo}>
          <span aria-hidden="true">↶</span>
          Undo
        </button>
        <button type="button" className="dock-button" aria-label="Redo" onClick={onRedo} disabled={!canRedo}>
          <span aria-hidden="true">↷</span>
          Redo
        </button>
        <button
          type="button"
          className="microphone-button"
          aria-label={microphoneLabel}
          onClick={toggleListening}
          disabled={isTranscribing}
        >
          <span aria-hidden="true">●</span>
        </button>
        <button type="button" className="dock-button" onClick={onRun}>
          <span aria-hidden="true">▶</span>
          Run
        </button>
        {hasPendingProposal ? (
          <>
            <button type="button" className="dock-button" onClick={onApply}>Apply</button>
            <button type="button" className="dock-button" onClick={onDiscard}>Discard</button>
          </>
        ) : null}
      </nav>
    </>
  );
}

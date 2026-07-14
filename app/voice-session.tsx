"use client";

import { useEffect, useRef, useState } from "react";
import {
  type CompletedTranscript,
  RealtimeTranscriptionClient,
  type RealtimeSessionState,
} from "./realtime-transcription-client";

const statusCopy: Record<RealtimeSessionState, string> = {
  idle: "Tap the microphone when you’re ready to code.",
  connecting: "Connecting to the microphone…",
  listening: "Listening for your next command…",
  disconnecting: "Stopping the microphone…",
  error: "Voice transcription needs attention.",
};

export function VoiceSession() {
  const client = useRef<RealtimeTranscriptionClient | null>(null);
  const [state, setState] = useState<RealtimeSessionState>("idle");
  const [error, setError] = useState<string>();
  const [transcripts, setTranscripts] = useState<CompletedTranscript[]>([]);

  useEffect(() => {
    const transcriptionClient = new RealtimeTranscriptionClient({
      onStateChange: (nextState, nextError) => {
        setState(nextState);
        setError(nextError);
      },
      onTranscript: (transcript) => {
        setTranscripts((current) => [transcript, ...current].slice(0, 3));
      },
    });
    client.current = transcriptionClient;

    return () => transcriptionClient.dispose();
  }, []);

  const toggleListening = () => {
    if (state === "listening" || state === "connecting") {
      client.current?.disconnect();
      return;
    }

    void client.current?.connect();
  };

  const isListening = state === "listening" || state === "connecting";
  const microphoneLabel = isListening ? "Stop listening" : "Start listening";

  return (
    <>
      <section className="transcript" aria-live="polite" aria-label="Voice transcript status">
        <span className="pulse" aria-hidden="true" />
        <div>
          <p className="eyebrow">Voice session · {state}</p>
          <p>{error ?? statusCopy[state]}</p>
          {transcripts.length > 0 ? (
            <ol className="completed-transcripts" aria-label="Completed transcripts">
              {transcripts.map((transcript) => (
                <li key={transcript.id}>{transcript.text}</li>
              ))}
            </ol>
          ) : null}
        </div>
      </section>

      <nav className="control-dock" aria-label="Editor controls">
        <button type="button" className="dock-button" aria-label="Undo" disabled>
          <span aria-hidden="true">↶</span>
          Undo
        </button>
        <button type="button" className="microphone-button" aria-label={microphoneLabel} onClick={toggleListening}>
          <span aria-hidden="true">●</span>
        </button>
        <button type="button" className="dock-button">
          <span aria-hidden="true">▶</span>
          Run
        </button>
      </nav>
    </>
  );
}

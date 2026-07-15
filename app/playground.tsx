"use client";

import { useCallback, useState } from "react";
import { challenges, getChallenge, type ChallengeId } from "./challenges";
import { CodeEditor } from "./code-editor";
import { VoiceSession } from "./voice-session";

type VoiceMode = "realtime" | "recording";
type ChallengeSources = Record<ChallengeId, string>;
type EditorRevisions = Record<ChallengeId, number>;

function createInitialSources(): ChallengeSources {
  return challenges.reduce<ChallengeSources>((sources, challenge) => {
    sources[challenge.id] = challenge.starterCode;
    return sources;
  }, {} as ChallengeSources);
}

function createInitialRevisions(): EditorRevisions {
  return challenges.reduce<EditorRevisions>((revisions, challenge) => {
    revisions[challenge.id] = 0;
    return revisions;
  }, {} as EditorRevisions);
}

export function Playground({ voiceMode }: { readonly voiceMode: VoiceMode }) {
  const [selectedId, setSelectedId] = useState<ChallengeId>(challenges[0].id);
  const [sources, setSources] = useState<ChallengeSources>(createInitialSources);
  const [editorRevisions, setEditorRevisions] = useState<EditorRevisions>(createInitialRevisions);
  const challenge = getChallenge(selectedId);

  const updateSource = useCallback(
    (source: string) => {
      setSources((current) => ({ ...current, [selectedId]: source }));
    },
    [selectedId],
  );

  const resetSource = () => {
    const confirmed = window.confirm(
      `Reset ${challenge.title} to its starter code? Your edits for this challenge will be lost.`,
    );

    if (!confirmed) {
      return;
    }

    setSources((current) => ({ ...current, [selectedId]: challenge.starterCode }));
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
          value={sources[selectedId]}
          onChange={updateSource}
        />
      </section>

      <VoiceSession mode={voiceMode} />
    </main>
  );
}

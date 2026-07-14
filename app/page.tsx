const starterCode = `def pair_sum(nums, target):
    # Your solution goes here
    return []`;

export default function Home() {
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
        <p className="eyebrow">Demo challenge · Python</p>
        <h1 id="challenge-title">Find a matching pair</h1>
        <p>
          Return the indices of two numbers whose sum matches the target.
          Exactly one answer exists.
        </p>
        <div className="example">
          <span>nums = [2, 7, 11, 15]</span>
          <span>target = 9 → [0, 1]</span>
        </div>
      </section>

      <section className="editor-panel" aria-labelledby="editor-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Virtual file</p>
            <h2 id="editor-title">solution.py</h2>
          </div>
          <span className="language-badge">Python</span>
        </div>
        <pre className="code-preview" aria-label="Python editor preview">
          <code>{starterCode}</code>
        </pre>
      </section>

      <section className="transcript" aria-live="polite" aria-label="Voice transcript status">
        <span className="pulse" aria-hidden="true" />
        <div>
          <p className="eyebrow">Voice session</p>
          <p>Tap the microphone when you’re ready to code.</p>
        </div>
      </section>

      <nav className="control-dock" aria-label="Editor controls">
        <button type="button" className="dock-button" aria-label="Undo" disabled>
          <span aria-hidden="true">↶</span>
          Undo
        </button>
        <button type="button" className="microphone-button" aria-label="Start listening">
          <span aria-hidden="true">●</span>
        </button>
        <button type="button" className="dock-button">
          <span aria-hidden="true">▶</span>
          Run
        </button>
      </nav>
    </main>
  );
}

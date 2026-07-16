"use client";

import type { PendingProposal } from "./editor-actions";

interface ProposalReviewProps {
  readonly proposal: PendingProposal;
  readonly onApply: () => void;
  readonly onDiscard: () => void;
}

export function ProposalReview({ proposal, onApply, onDiscard }: ProposalReviewProps) {
  const selected = proposal.capturedSource.slice(proposal.range.from, proposal.range.to);

  return (
    <section className="proposal-review" aria-labelledby="proposal-title">
      <div className="proposal-heading">
        <div>
          <p className="eyebrow">Pending AI edit</p>
          <h2 id="proposal-title">Review before applying</h2>
        </div>
        <span className="proposal-range">{proposal.range.from}–{proposal.range.to}</span>
      </div>
      <p className="proposal-explanation">{proposal.explanation}</p>
      <div className="proposal-diff" aria-label="Proposed code change">
        <div>
          <span>Current selection</span>
          <pre className="proposal-before">{selected || "(cursor)"}</pre>
        </div>
        <div>
          <span>Proposed replacement</span>
          <pre className="proposal-after">{proposal.replacement || "(remove selection)"}</pre>
        </div>
      </div>
      <div className="proposal-controls">
        <button type="button" onClick={onApply}>Apply change</button>
        <button type="button" onClick={onDiscard}>Discard change</button>
      </div>
    </section>
  );
}

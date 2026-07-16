import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Playground } from "./playground";

vi.mock("./code-editor", () => ({
  CodeEditor: ({
    value,
    onChange,
    onSelectionChange,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSelectionChange: (range: { from: number; to: number }) => void;
  }) => (
    <>
      <textarea aria-label="Python code editor" value={value} onChange={(event) => onChange(event.target.value)} />
      <button type="button" onClick={() => onSelectionChange({ from: 0, to: 3 })}>Select first token</button>
    </>
  ),
}));

vi.mock("./python-test-runner", () => ({ PythonTestRunner: () => null }));

vi.mock("./voice-session", () => ({
  VoiceSession: ({ onCompletedTranscript }: { onCompletedTranscript: (transcript: { id: string; text: string }) => void }) => (
    <button type="button" onClick={() => onCompletedTranscript({ id: "change-1", text: "change use a dictionary" })}>
      Request AI change
    </button>
  ),
}));

function response(body: unknown): Response {
  return { ok: true, status: 200, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}

describe("AI proposals in the playground", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects an unselected change locally without calling the edit API", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<Playground voiceMode="realtime" />);

    fireEvent.click(screen.getByRole("button", { name: "Request AI change" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Select code before asking HFC to change it.");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reviews a proposal, then applies only its captured range", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({
      replacement: "FUNC",
      explanation: "Keep the function declaration while preparing a targeted edit.",
    }));
    vi.stubGlobal("fetch", fetcher);
    render(<Playground voiceMode="realtime" />);

    fireEvent.click(screen.getByRole("button", { name: "Select first token" }));
    fireEvent.click(screen.getByRole("button", { name: "Request AI change" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Review before applying" })).toBeInTheDocument());
    expect(screen.getByLabelText("Proposed code change")).toHaveTextContent("Current selection");
    expect(screen.getByText("Keep the function declaration while preparing a targeted edit.")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Apply change" }));

    expect(screen.queryByRole("heading", { name: "Review before applying" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue(
      "FUNC pair_sum(nums, target):\n    # Return the two matching indices.\n    return []",
    );
  });
});

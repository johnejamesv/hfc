import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { challenges, getChallenge } from "./challenges";
import Home from "./page";

vi.mock("./code-editor", () => ({
  CodeEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea
      aria-label="Python code editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

describe("Home", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("renders the mobile playground shell", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Contains a duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Challenge" })).toHaveValue("contains-duplicate");
    expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue(
      getChallenge("contains-duplicate").starterCode,
    );
    expect(screen.getByRole("button", { name: "Start listening" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Editor controls" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Voice transcript status" })).toHaveTextContent("idle");
    expect(screen.getByText("Literal dictation vocabulary")).toBeInTheDocument();
  });

  it("honors an explicit voice transport instead of provider-key inference", () => {
    const originalMode = process.env.HFC_VOICE_MODE;
    const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;

    try {
      process.env.OPENROUTER_API_KEY = "configured-openrouter-key";
      process.env.HFC_VOICE_MODE = "realtime";
      const realtime = render(<Home />);
      expect(screen.getByRole("button", { name: "Start listening" })).toBeInTheDocument();
      realtime.unmount();

      process.env.HFC_VOICE_MODE = "recording";
      render(<Home />);
      expect(screen.getByRole("button", { name: "Record one phrase" })).toBeInTheDocument();
    } finally {
      if (originalMode === undefined) delete process.env.HFC_VOICE_MODE;
      else process.env.HFC_VOICE_MODE = originalMode;
      if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = originalOpenRouterKey;
    }
  });

  it("retains each challenge source while switching between all challenges", () => {
    render(<Home />);

    const selector = screen.getByRole("combobox", { name: "Challenge" });
    for (const challenge of challenges) {
      fireEvent.change(selector, { target: { value: challenge.id } });
      expect(screen.getByRole("heading", { name: challenge.title })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue(challenge.starterCode);
      fireEvent.change(screen.getByRole("textbox", { name: "Python code editor" }), {
        target: { value: `# custom ${challenge.id} solution` },
      });
    }

    for (const challenge of challenges) {
      fireEvent.change(selector, { target: { value: challenge.id } });
      expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue(
        `# custom ${challenge.id} solution`,
      );
    }
  });

  it("cancels reset without changing the source and confirms before restoring starter code", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Home />);

    const editor = screen.getByRole("textbox", { name: "Python code editor" });
    fireEvent.change(editor, { target: { value: "# keep this edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Your edits for this challenge will be lost"));
    expect(editor).toHaveValue("# keep this edit");

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue(
      getChallenge("contains-duplicate").starterCode,
    );
  });

  it("restores the selected challenge and each saved source after a reload", async () => {
    const first = render(<Home />);
    const selector = screen.getByRole("combobox", { name: "Challenge" });
    fireEvent.change(screen.getByRole("textbox", { name: "Python code editor" }), {
      target: { value: "# saved duplicate solution" },
    });
    fireEvent.change(selector, { target: { value: "vowel-count" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Python code editor" }), {
      target: { value: "# saved vowel solution" },
    });

    await waitFor(() => expect(window.localStorage.getItem("hfc-progress")).toContain("saved vowel solution"));
    first.unmount();
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("combobox", { name: "Challenge" })).toHaveValue("vowel-count"));
    expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue("# saved vowel solution");
    fireEvent.change(screen.getByRole("combobox", { name: "Challenge" }), { target: { value: "contains-duplicate" } });
    expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue("# saved duplicate solution");
  });
});

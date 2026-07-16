import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getChallenge } from "./challenges";
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
  });

  it("renders the mobile playground shell", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { name: "Find a matching pair" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Challenge" })).toHaveValue("pair-sum");
    expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue(
      getChallenge("pair-sum").starterCode,
    );
    expect(screen.getByRole("button", { name: "Start listening" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Editor controls" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Voice transcript status" })).toHaveTextContent("idle");
    expect(screen.getByText("Literal dictation vocabulary")).toBeInTheDocument();
  });

  it("retains each challenge source while switching between all three challenges", () => {
    render(<Home />);

    const selector = screen.getByRole("combobox", { name: "Challenge" });
    fireEvent.change(screen.getByRole("textbox", { name: "Python code editor" }), {
      target: { value: "# custom pair solution" },
    });

    fireEvent.change(selector, { target: { value: "vowel-count" } });
    expect(screen.getByRole("heading", { name: "Count the vowels" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue(
      getChallenge("vowel-count").starterCode,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Python code editor" }), {
      target: { value: "# custom vowel solution" },
    });

    fireEvent.change(selector, { target: { value: "steady-rises" } });
    expect(screen.getByRole("heading", { name: "Measure steady rises" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue(
      getChallenge("steady-rises").starterCode,
    );

    fireEvent.change(selector, { target: { value: "pair-sum" } });
    expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue(
      "# custom pair solution",
    );

    fireEvent.change(selector, { target: { value: "vowel-count" } });
    expect(screen.getByRole("textbox", { name: "Python code editor" })).toHaveValue(
      "# custom vowel solution",
    );
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
      getChallenge("pair-sum").starterCode,
    );
  });
});

import { describe, expect, it, vi } from "vitest";
import { challenges } from "./challenges";
import {
  progressSchemaVersion,
  progressStorageKey,
  readProgress,
  restoreProgress,
  serializeProgress,
  writeProgress,
} from "./persistence";

const solutions = Object.fromEntries(challenges.map((challenge) => [challenge.id, `# ${challenge.id}`])) as Record<
  (typeof challenges)[number]["id"],
  string
>;

describe("challenge progress persistence", () => {
  it("round-trips every challenge source and the selected challenge", () => {
    expect(restoreProgress(serializeProgress("vowel-count", solutions))).toEqual({
      selectedId: "vowel-count",
      solutions,
    });
  });

  it.each([
    ["malformed JSON", "{"],
    ["a non-object", JSON.stringify("not progress")],
    ["an unsupported schema version", JSON.stringify({ version: progressSchemaVersion + 1, selectedId: "pair-sum", solutions })],
    ["wrong solution field types", JSON.stringify({ version: progressSchemaVersion, selectedId: "pair-sum", solutions: "nope" })],
  ])("ignores %s", (_description, serialized) => {
    expect(restoreProgress(serialized)).toBeUndefined();
  });

  it("keeps valid solutions but safely falls back from an unknown selected challenge and invalid solution entries", () => {
    expect(restoreProgress(JSON.stringify({
      version: progressSchemaVersion,
      selectedId: "not-a-challenge",
      solutions: { "pair-sum": "# retained", "vowel-count": 42, unknown: "ignored" },
    }))).toEqual({
      selectedId: "contains-duplicate",
      solutions: { "pair-sum": "# retained" },
    });
  });

  it("handles unavailable browser storage without throwing or retaining sensitive data", () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error("blocked"); }),
      setItem: vi.fn(() => { throw new Error("blocked"); }),
    };

    expect(readProgress(storage)).toBeUndefined();
    expect(() => writeProgress(storage, "pair-sum", solutions)).not.toThrow();
    expect(storage.setItem).toHaveBeenCalledWith(progressStorageKey, expect.not.stringContaining("OPENAI_API_KEY"));
  });
});

import { describe, expect, it, vi } from "vitest";
import { EditRequestError, requestEditProposal } from "./ai-edit-client";

const request = {
  kind: "write" as const,
  instruction: "add a loop",
  challengeSummary: "Count vowels.",
  source: "def count_vowels(text):\n    return 0",
  range: { from: 0, to: 0 },
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("AI edit client", () => {
  it("posts only the bounded edit request and returns a proposal", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ replacement: "for char in text:\n", explanation: "Iterate over text." }));

    await expect(requestEditProposal(request, fetcher)).resolves.toEqual({
      replacement: "for char in text:\n",
      explanation: "Iterate over text.",
    });
    expect(fetcher).toHaveBeenCalledWith("/api/edit", expect.objectContaining({
      method: "POST",
      body: JSON.stringify(request),
    }));
  });

  it("reports malformed output as an error rather than inventing a proposal", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ replacement: 42 }));

    await expect(requestEditProposal(request, fetcher)).rejects.toEqual(
      new EditRequestError("The edit service returned an invalid proposal. Please try again."),
    );
  });
});

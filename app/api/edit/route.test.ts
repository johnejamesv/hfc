import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function providerResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validRequest = {
  kind: "change",
  instruction: "use a dictionary for the lookup",
  challengeSummary: "Return the two positions whose values reach a target sum.",
  source: "def pair_sum(nums, target):\n    return []",
  range: { from: 4, to: 12 },
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("POST /api/edit", () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_EDIT_MODEL;
  const originalAdapter = process.env.HFC_EDIT_ADAPTER;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restore("OPENAI_API_KEY", originalKey);
    restore("OPENAI_EDIT_MODEL", originalModel);
    restore("HFC_EDIT_ADAPTER", originalAdapter);
  });

  it("validates a selection-required change before calling a provider", async () => {
    process.env.OPENAI_API_KEY = "server-only-key";
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(request({ ...validRequest, range: { from: 3, to: 3 } }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Select code before asking HFC to change it." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses strict structured output and never serializes the permanent key", async () => {
    process.env.OPENAI_API_KEY = "server-only-key";
    process.env.OPENAI_EDIT_MODEL = "test-edit-model";
    const fetcher = vi.fn().mockResolvedValue(providerResponse({
      output_text: JSON.stringify({ replacement: "lookup = {}", explanation: "Start a lookup table." }),
    }));
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(request(validRequest));

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer server-only-key" }),
      }),
    );
    const upstreamBody = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
    expect(upstreamBody.model).toBe("test-edit-model");
    expect(upstreamBody.text.format).toMatchObject({
      type: "json_schema",
      name: "targeted_python_edit",
      strict: true,
      schema: { additionalProperties: false, required: ["replacement", "explanation"] },
    });
    expect(upstreamBody.input[1].content).toContain("current_python_source");
    const result = await response.json();
    expect(result).toEqual({ replacement: "lookup = {}", explanation: "Start a lookup table." });
    expect(JSON.stringify(result)).not.toContain("server-only-key");
  });

  it("rejects malformed provider output without changing any client document", async () => {
    process.env.OPENAI_API_KEY = "server-only-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(providerResponse({ output_text: "not JSON" })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request(validRequest));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "The AI edit service returned an invalid proposal. Please try again." });
  });

  it("supports deterministic local proposal review without an API key", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.HFC_EDIT_ADAPTER = "mock";
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(request({ ...validRequest, kind: "write", range: { from: 0, to: 0 } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      replacement: "# Mock edit: use a dictionary for the lookup\n",
      explanation: "Deterministic mock proposal for local development.",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

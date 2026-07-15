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
  return new Request("http://localhost/api/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("POST /api/transcribe", () => {
  const originalOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENROUTER_TRANSCRIPTION_MODEL;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restore("OPENROUTER_API_KEY", originalOpenRouterKey);
    restore("OPENAI_API_KEY", originalOpenAIKey);
    restore("OPENROUTER_TRANSCRIPTION_MODEL", originalModel);
  });

  it("returns an actionable error when no OpenRouter key is configured", async () => {
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const response = await POST(request({ audio: "YXVkaW8=", format: "mp4" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Voice transcription is unavailable. Set OPENROUTER_API_KEY on the server and try again.",
    });
  });

  it("sends recorded audio to OpenRouter without returning the permanent key", async () => {
    process.env.OPENROUTER_API_KEY = "server-only-openrouter-key";
    process.env.OPENROUTER_TRANSCRIPTION_MODEL = "openai/gpt-4o-transcribe";
    const fetcher = vi.fn().mockResolvedValue(providerResponse({ text: "run tests" }));
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(request({ audio: "YXVkaW8=", format: "mp4" }));

    expect(fetcher).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer server-only-openrouter-key" }),
      }),
    );
    const upstreamBody = JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string);
    expect(upstreamBody).toEqual({
      input_audio: { data: "YXVkaW8=", format: "mp4" },
      model: "openai/gpt-4o-transcribe",
      language: "en",
    });
    expect(await response.json()).toEqual({ text: "run tests" });
  });

  it("does not forward provider authentication details", async () => {
    process.env.OPENROUTER_API_KEY = "rejected-openrouter-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(providerResponse({ error: { message: "rejected-openrouter-key" } }, 401)),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request({ audio: "YXVkaW8=", format: "webm" }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: "The server's OpenRouter API key was rejected. Replace OPENROUTER_API_KEY and restart the server.",
    });
    expect(JSON.stringify(body)).not.toContain("rejected-openrouter-key");
  });
});

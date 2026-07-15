import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function openAIResponse(body: unknown, ok = true, status = ok ? 200 : 500): Response {
  return {
    ok,
    status,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

describe("POST /api/realtime-token", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalRealtimeModel = process.env.OPENAI_REALTIME_MODEL;
  const originalTranscriptionModel = process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL;

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    restoreEnvironment("OPENAI_API_KEY", originalApiKey);
    restoreEnvironment("OPENAI_REALTIME_MODEL", originalRealtimeModel);
    restoreEnvironment("OPENAI_REALTIME_TRANSCRIPTION_MODEL", originalTranscriptionModel);
  });

  it("returns a safe, actionable error when the server API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Voice transcription is unavailable. Set OPENAI_API_KEY on the server and try again.",
    });
  });

  it("mints a short-lived credential with server VAD and never returns the permanent key", async () => {
    process.env.OPENAI_API_KEY = "permanent-server-key";
    process.env.OPENAI_REALTIME_MODEL = "test-realtime-model";
    process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL = "test-transcription-model";
    const fetcher = vi.fn().mockResolvedValue(openAIResponse({ value: "ephemeral-key", expires_at: 12345 }));
    vi.stubGlobal("fetch", fetcher);

    const response = await POST();

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/client_secrets",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer permanent-server-key",
          "Content-Type": "application/json",
        },
      }),
    );
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      session: {
        type: "realtime",
        model: "test-realtime-model",
        audio: {
          input: {
            transcription: { model: "test-transcription-model", language: "en" },
            turn_detection: { type: "server_vad", create_response: false },
          },
        },
      },
    });
    expect(await response.json()).toEqual({ value: "ephemeral-key", expires_at: 12345 });
  });

  it("reports a rejected key without forwarding provider details to the browser", async () => {
    process.env.OPENAI_API_KEY = "rejected-server-key";
    const providerMessage = "Incorrect API key provided: rejected-server-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(openAIResponse({ error: { message: providerMessage } }, false, 401)),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: "The server's OpenAI API key was rejected. Replace OPENAI_API_KEY and restart the server.",
    });
    expect(JSON.stringify(body)).not.toContain("rejected-server-key");
    expect(log).toHaveBeenCalledWith(
      "[realtime-token] OpenAI credential request failed",
      { status: 401, requestId: undefined },
    );
  });
});

import { NextResponse } from "next/server";

const OPENROUTER_TRANSCRIPTIONS_URL = "https://openrouter.ai/api/v1/audio/transcriptions";
const MAX_BASE64_LENGTH = 12_000_000;
const AUDIO_FORMATS = new Set(["flac", "m4a", "mp3", "mp4", "ogg", "wav", "webm"]);

type TranscriptionRequest = {
  audio?: unknown;
  format?: unknown;
};

function openRouterApiKey(): string | undefined {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;

  // Backwards-compatible with a key placed in OPENAI_API_KEY before the
  // MediaRecorder fallback was selected. OpenRouter keys use this prefix.
  const legacyKey = process.env.OPENAI_API_KEY;
  return legacyKey?.startsWith("sk-or-") ? legacyKey : undefined;
}

export async function POST(request: Request) {
  const apiKey = openRouterApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice transcription is unavailable. Set OPENROUTER_API_KEY on the server and try again." },
      { status: 503 },
    );
  }

  const body: TranscriptionRequest | null = await request.json().catch(() => null);
  if (
    !body ||
    typeof body.audio !== "string" ||
    body.audio.length === 0 ||
    body.audio.length > MAX_BASE64_LENGTH ||
    typeof body.format !== "string" ||
    !AUDIO_FORMATS.has(body.format)
  ) {
    return NextResponse.json({ error: "The recorded audio was invalid or too large. Please try again." }, { status: 400 });
  }

  try {
    const response = await fetch(OPENROUTER_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "HFC",
      },
      body: JSON.stringify({
        input_audio: { data: body.audio, format: body.format },
        model: process.env.OPENROUTER_TRANSCRIPTION_MODEL ?? "openai/gpt-4o-transcribe",
        language: "en",
      }),
      cache: "no-store",
    });
    const result: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("[transcribe] OpenRouter transcription failed", {
        status: response.status,
        generationId: response.headers.get("x-generation-id") ?? undefined,
      });
      return NextResponse.json(
        {
          error:
            response.status === 401
              ? "The server's OpenRouter API key was rejected. Replace OPENROUTER_API_KEY and restart the server."
              : "The recording could not be transcribed. Please try again.",
        },
        { status: 502 },
      );
    }

    const text =
      typeof result === "object" && result !== null && typeof (result as { text?: unknown }).text === "string"
        ? (result as { text: string }).text.trim()
        : "";
    if (!text) {
      return NextResponse.json({ error: "No speech was detected. Please record a short phrase and try again." }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch {
    console.error("[transcribe] Could not reach OpenRouter");
    return NextResponse.json(
      { error: "Could not reach the transcription service. Check your connection and try again." },
      { status: 502 },
    );
  }
}

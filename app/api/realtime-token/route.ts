import { NextResponse } from "next/server";

const OPENAI_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

type OpenAIError = {
  error?: { message?: string };
};

function errorMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }

  return (body as OpenAIError).error?.message;
}

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Voice transcription is unavailable. Set OPENAI_API_KEY on the server and try again." },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(OPENAI_CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          // A Realtime session with server VAD commits each spoken turn while the
          // WebRTC microphone stays connected. A transcription-only session using
          // gpt-realtime-whisper requires client-managed commits instead.
          type: "realtime",
          model: process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime",
          audio: {
            input: {
              transcription: {
                model: process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ?? "gpt-4o-mini-transcribe",
                language: "en",
              },
              turn_detection: {
                type: "server_vad",
                create_response: false,
              },
            },
          },
        },
      }),
      cache: "no-store",
    });

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        { error: errorMessage(body) ?? "Could not start voice transcription. Please try again." },
        { status: 502 },
      );
    }

    if (typeof body !== "object" || body === null || typeof (body as { value?: unknown }).value !== "string") {
      return NextResponse.json(
        { error: "The transcription service returned an invalid short-lived credential." },
        { status: 502 },
      );
    }

    const credential = body as { value: string; expires_at?: unknown };
    return NextResponse.json({
      value: credential.value,
      expires_at: typeof credential.expires_at === "number" ? credential.expires_at : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "Could not reach the transcription service. Check your connection and try again." },
      { status: 502 },
    );
  }
}

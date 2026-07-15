import { describe, expect, it, vi } from "vitest";
import {
  type AudioRecorder,
  MediaRecorderTranscriptionClient,
} from "./media-recorder-transcription-client";

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function mediaStream() {
  const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track };
}

function recorder() {
  let dataListener: ((event: { data: Blob }) => void) | undefined;
  let stopListener: (() => void) | undefined;
  const value: AudioRecorder & { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> } = {
    mimeType: "audio/mp4",
    state: "inactive",
    addEventListener: vi.fn((type, listener) => {
      if (type === "dataavailable") dataListener = listener as (event: { data: Blob }) => void;
      else stopListener = listener as () => void;
    }),
    start: vi.fn(() => {
      Object.defineProperty(value, "state", { value: "recording", configurable: true });
    }),
    stop: vi.fn(() => {
      Object.defineProperty(value, "state", { value: "inactive", configurable: true });
      dataListener?.({ data: new Blob(["audio"], { type: "audio/mp4" }) });
      stopListener?.();
    }),
  };
  return value;
}

describe("MediaRecorderTranscriptionClient", () => {
  it("records one phrase and emits it through the shared completed-transcript callback", async () => {
    const media = mediaStream();
    const audioRecorder = recorder();
    const fetcher = vi.fn().mockResolvedValue(response({ text: "run tests" }));
    const transcripts: string[] = [];
    const states: string[] = [];
    const client = new MediaRecorderTranscriptionClient({
      createRecorder: () => audioRecorder,
      fetch: fetcher,
      getUserMedia: vi.fn().mockResolvedValue(media.stream),
      onStateChange: (state) => states.push(state),
      onTranscript: ({ text }) => transcripts.push(text),
    });

    await client.connect();
    client.disconnect();
    await vi.waitFor(() => expect(client.getState()).toBe("idle"));

    expect(states).toEqual(["connecting", "listening", "disconnecting", "transcribing", "idle"]);
    expect(media.track.stop).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/transcribe",
      expect.objectContaining({ method: "POST", body: expect.stringContaining('"format":"mp4"') }),
    );
    expect(transcripts).toEqual(["run tests"]);
  });

  it("does not create duplicate sessions and releases both start/stop cycles", async () => {
    const firstMedia = mediaStream();
    const secondMedia = mediaStream();
    const firstRecorder = recorder();
    const secondRecorder = recorder();
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce(firstMedia.stream)
      .mockResolvedValueOnce(secondMedia.stream);
    const createRecorder = vi.fn().mockReturnValueOnce(firstRecorder).mockReturnValueOnce(secondRecorder);
    const client = new MediaRecorderTranscriptionClient({
      createRecorder,
      fetch: vi.fn().mockResolvedValue(response({ text: "hello" })),
      getUserMedia,
    });

    await client.connect();
    await client.connect();
    client.disconnect();
    await vi.waitFor(() => expect(client.getState()).toBe("idle"));
    await client.connect();
    client.disconnect();
    await vi.waitFor(() => expect(client.getState()).toBe("idle"));

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(createRecorder).toHaveBeenCalledTimes(2);
    expect(firstRecorder.stop).toHaveBeenCalledTimes(1);
    expect(secondRecorder.stop).toHaveBeenCalledTimes(1);
    expect(firstMedia.track.stop).toHaveBeenCalledTimes(1);
    expect(secondMedia.track.stop).toHaveBeenCalledTimes(1);
  });
});

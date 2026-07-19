import {
  type CompletedTranscript,
  type RealtimeSessionState,
} from "./realtime-transcription-client";
import { getMicrophoneStream } from "./microphone-capture";

type RecorderDataEvent = { data: Blob };

export type AudioRecorder = {
  readonly mimeType: string;
  readonly state: string;
  addEventListener(type: "dataavailable", listener: (event: RecorderDataEvent) => void): void;
  addEventListener(type: "stop", listener: () => void): void;
  start(): void;
  stop(): void;
};

export type MediaRecorderTranscriptionClientOptions = {
  createRecorder?: (stream: MediaStream) => AudioRecorder;
  fetch?: typeof fetch;
  getUserMedia?: () => Promise<MediaStream>;
  onStateChange?: (state: RealtimeSessionState, error?: string) => void;
  onTranscript?: (transcript: CompletedTranscript) => void;
  transcriptionEndpoint?: string;
};

const DEFAULT_TRANSCRIPTION_ENDPOINT = "/api/transcribe";

function preferredMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
}

function recorderFormat(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mpeg") || normalized.includes("mp3")) return "mp3";
  return "m4a";
}

async function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("The recorded audio could not be read. Please try again."));
    });
    reader.addEventListener("error", () => reject(new Error("The recorded audio could not be read. Please try again.")));
    reader.readAsArrayBuffer(blob);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await readBlob(blob));
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export class MediaRecorderTranscriptionClient {
  private readonly createRecorder: (stream: MediaStream) => AudioRecorder;
  private readonly fetcher: typeof fetch;
  private readonly getUserMedia: () => Promise<MediaStream>;
  private readonly onStateChange?: MediaRecorderTranscriptionClientOptions["onStateChange"];
  private readonly onTranscript?: MediaRecorderTranscriptionClientOptions["onTranscript"];
  private readonly transcriptionEndpoint: string;
  private state: RealtimeSessionState = "idle";
  private attempt = 0;
  private chunks: Blob[] = [];
  private recorder: AudioRecorder | undefined;
  private stream: MediaStream | undefined;

  constructor(options: MediaRecorderTranscriptionClientOptions = {}) {
    this.createRecorder =
      options.createRecorder ??
      ((stream) => {
        const mimeType = preferredMimeType();
        return new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      });
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.getUserMedia = options.getUserMedia ?? getMicrophoneStream;
    this.onStateChange = options.onStateChange;
    this.onTranscript = options.onTranscript;
    this.transcriptionEndpoint = options.transcriptionEndpoint ?? DEFAULT_TRANSCRIPTION_ENDPOINT;
  }

  getState(): RealtimeSessionState {
    return this.state;
  }

  async connect(): Promise<void> {
    if (this.state !== "idle" && this.state !== "error") return;

    const attempt = ++this.attempt;
    this.chunks = [];
    this.setState("connecting");

    try {
      const stream = await this.getUserMedia();
      if (!this.isCurrent(attempt, "connecting")) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.stream = stream;
      const recorder = this.createRecorder(stream);
      this.recorder = recorder;
      recorder.addEventListener("dataavailable", ({ data }) => {
        if (data.size > 0 && attempt === this.attempt) this.chunks.push(data);
      });
      recorder.addEventListener("stop", () => void this.transcribe(attempt, recorder.mimeType));
      recorder.start();
      this.setState("listening");
    } catch (error) {
      if (!this.isCurrent(attempt, "connecting")) return;
      this.releaseResources(false);
      this.setState("error", this.actionableError(error));
    }
  }

  disconnect(): void {
    if (this.state === "idle" || this.state === "disconnecting") return;

    if (this.state === "listening" && this.recorder) {
      this.setState("disconnecting");
      const recorder = this.recorder;
      this.recorder = undefined;
      this.setState("transcribing");
      recorder.stop();
      this.stopTracks();
      return;
    }

    ++this.attempt;
    this.setState("disconnecting");
    this.releaseResources(true);
    this.setState("idle");
  }

  dispose(): void {
    ++this.attempt;
    this.releaseResources(true);
    this.state = "idle";
  }

  private async transcribe(attempt: number, mimeType: string): Promise<void> {
    if (!this.isCurrent(attempt, "transcribing")) return;

    try {
      const blob = new Blob(this.chunks, { type: mimeType });
      this.chunks = [];
      if (blob.size === 0) throw new Error("No audio was recorded. Please try again.");

      const response = await this.fetcher(this.transcriptionEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: await blobToBase64(blob), format: recorderFormat(mimeType) }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!this.isCurrent(attempt, "transcribing")) return;

      if (!response.ok) {
        throw new Error(this.readError(body) ?? "The recording could not be transcribed. Please try again.");
      }
      const text =
        typeof body === "object" && body !== null && typeof (body as { text?: unknown }).text === "string"
          ? (body as { text: string }).text.trim()
          : "";
      if (!text) throw new Error("No speech was detected. Please record a short phrase and try again.");

      this.onTranscript?.({ id: `recording-${attempt}`, text });
      this.setState("idle");
    } catch (error) {
      if (!this.isCurrent(attempt, "transcribing")) return;
      this.setState("error", this.actionableError(error));
    }
  }

  private releaseResources(stopRecorder: boolean): void {
    const recorder = this.recorder;
    this.recorder = undefined;
    if (stopRecorder && recorder?.state !== "inactive") recorder?.stop();
    this.stopTracks();
    this.chunks = [];
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
  }

  private isCurrent(attempt: number, state: RealtimeSessionState): boolean {
    return this.attempt === attempt && this.state === state;
  }

  private setState(state: RealtimeSessionState, error?: string): void {
    this.state = state;
    this.onStateChange?.(state, error);
  }

  private readError(body: unknown): string | undefined {
    if (typeof body !== "object" || body === null) return undefined;
    const error = (body as { error?: unknown }).error;
    return typeof error === "string" ? error : undefined;
  }

  private actionableError(error: unknown): string {
    return error instanceof Error && error.message
      ? error.message
      : "Voice recording could not start. Check microphone permission and try again.";
  }
}

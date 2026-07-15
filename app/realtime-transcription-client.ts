export type RealtimeSessionState =
  | "idle"
  | "connecting"
  | "listening"
  | "disconnecting"
  | "transcribing"
  | "error";

export type CompletedTranscript = {
  id: string;
  text: string;
};

type DataChannelMessage = { data: string };

export type RealtimeDataChannel = {
  addEventListener(type: "message", listener: (event: DataChannelMessage) => void): void;
  close(): void;
};

export type RealtimePeerConnection = {
  addTrack(track: MediaStreamTrack, stream: MediaStream): void;
  createDataChannel(label: string): RealtimeDataChannel;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  close(): void;
};

export type RealtimeTranscriptionClientOptions = {
  createPeerConnection?: () => RealtimePeerConnection;
  fetch?: typeof fetch;
  getUserMedia?: () => Promise<MediaStream>;
  onStateChange?: (state: RealtimeSessionState, error?: string) => void;
  onTranscript?: (transcript: CompletedTranscript) => void;
  realtimeEndpoint?: string;
  tokenEndpoint?: string;
};

type CredentialResponse = { value?: unknown };
type RealtimeEvent = { type?: unknown; item_id?: unknown; transcript?: unknown };

const DEFAULT_TOKEN_ENDPOINT = "/api/realtime-token";
const DEFAULT_REALTIME_ENDPOINT = "https://api.openai.com/v1/realtime/calls";

export class RealtimeTranscriptionClient {
  private readonly createPeerConnection: () => RealtimePeerConnection;
  private readonly fetcher: typeof fetch;
  private readonly getUserMedia: () => Promise<MediaStream>;
  private readonly onStateChange?: RealtimeTranscriptionClientOptions["onStateChange"];
  private readonly onTranscript?: RealtimeTranscriptionClientOptions["onTranscript"];
  private readonly realtimeEndpoint: string;
  private readonly tokenEndpoint: string;
  private state: RealtimeSessionState = "idle";
  private attempt = 0;
  private peerConnection: RealtimePeerConnection | undefined;
  private dataChannel: RealtimeDataChannel | undefined;
  private stream: MediaStream | undefined;
  private completedItemIds = new Set<string>();

  constructor(options: RealtimeTranscriptionClientOptions = {}) {
    this.createPeerConnection = options.createPeerConnection ?? (() => new RTCPeerConnection());
    // Safari requires Window.fetch to be invoked with Window as its receiver.
    // Keeping the bare function and calling it later loses that receiver.
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.getUserMedia = options.getUserMedia ?? (() => navigator.mediaDevices.getUserMedia({ audio: true }));
    this.onStateChange = options.onStateChange;
    this.onTranscript = options.onTranscript;
    this.realtimeEndpoint = options.realtimeEndpoint ?? DEFAULT_REALTIME_ENDPOINT;
    this.tokenEndpoint = options.tokenEndpoint ?? DEFAULT_TOKEN_ENDPOINT;
  }

  getState(): RealtimeSessionState {
    return this.state;
  }

  async connect(): Promise<void> {
    if (this.state !== "idle" && this.state !== "error") {
      return;
    }

    const attempt = ++this.attempt;
    this.completedItemIds.clear();
    this.setState("connecting");

    try {
      const credential = await this.requestCredential();
      if (!this.isCurrent(attempt)) return;

      const peerConnection = this.createPeerConnection();
      this.peerConnection = peerConnection;
      const dataChannel = peerConnection.createDataChannel("oai-events");
      this.dataChannel = dataChannel;
      dataChannel.addEventListener("message", (event) => this.handleDataChannelMessage(event));

      const stream = await this.getUserMedia();
      if (!this.isCurrent(attempt)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.stream = stream;
      for (const track of stream.getTracks()) {
        peerConnection.addTrack(track, stream);
      }

      const offer = await peerConnection.createOffer();
      if (!this.isCurrent(attempt)) return;
      await peerConnection.setLocalDescription(offer);
      if (!this.isCurrent(attempt)) return;

      const answerResponse = await this.fetcher(this.realtimeEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp ?? "",
      });
      if (!this.isCurrent(attempt)) return;
      if (!answerResponse.ok) {
        throw new Error("The transcription connection could not be negotiated. Please try again.");
      }

      const answerSdp = await answerResponse.text();
      if (!this.isCurrent(attempt)) return;
      await peerConnection.setRemoteDescription({ type: "answer", sdp: answerSdp });
      if (!this.isCurrent(attempt)) return;
      this.setState("listening");
    } catch (error) {
      if (!this.isCurrent(attempt)) return;
      this.releaseResources();
      this.setState("error", this.toActionableError(error));
    }
  }

  disconnect(): void {
    if (this.state === "idle" || this.state === "disconnecting") {
      return;
    }

    ++this.attempt;
    this.setState("disconnecting");
    this.releaseResources();
    this.setState("idle");
  }

  dispose(): void {
    this.disconnect();
  }

  private async requestCredential(): Promise<string> {
    const response = await this.fetcher(this.tokenEndpoint, { method: "POST", cache: "no-store" });
    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const message = this.readErrorMessage(body);
      throw new Error(message ?? "Voice transcription is unavailable. Check the server configuration and try again.");
    }

    const value = typeof body === "object" && body !== null ? (body as CredentialResponse).value : undefined;
    if (typeof value !== "string" || value.length === 0) {
      throw new Error("The server returned an invalid short-lived credential. Please try again.");
    }

    return value;
  }

  private handleDataChannelMessage(message: DataChannelMessage): void {
    if (this.state !== "listening") return;

    let event: RealtimeEvent;
    try {
      event = JSON.parse(message.data) as RealtimeEvent;
    } catch {
      return;
    }

    if (
      event.type !== "conversation.item.input_audio_transcription.completed" ||
      typeof event.item_id !== "string" ||
      typeof event.transcript !== "string" ||
      this.completedItemIds.has(event.item_id)
    ) {
      return;
    }

    this.completedItemIds.add(event.item_id);
    this.onTranscript?.({ id: event.item_id, text: event.transcript });
  }

  private releaseResources(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    this.dataChannel?.close();
    this.dataChannel = undefined;
    this.peerConnection?.close();
    this.peerConnection = undefined;
  }

  private isCurrent(attempt: number): boolean {
    return this.attempt === attempt && this.state === "connecting";
  }

  private setState(state: RealtimeSessionState, error?: string): void {
    this.state = state;
    this.onStateChange?.(state, error);
  }

  private readErrorMessage(body: unknown): string | undefined {
    if (typeof body !== "object" || body === null) return undefined;
    const error = (body as { error?: unknown }).error;
    return typeof error === "string" ? error : undefined;
  }

  private toActionableError(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return "Voice transcription could not start. Check microphone permission and try again.";
  }
}

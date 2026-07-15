import { describe, expect, it, vi } from "vitest";
import {
  RealtimeTranscriptionClient,
  type RealtimeDataChannel,
  type RealtimePeerConnection,
} from "./realtime-transcription-client";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function response(body: unknown, options: { ok?: boolean; text?: string } = {}): Response {
  return {
    ok: options.ok ?? true,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(options.text ?? "remote-sdp"),
  } as unknown as Response;
}

function createMediaStream() {
  const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
  return {
    stream: { getTracks: () => [track] } as unknown as MediaStream,
    track,
  };
}

function makePeerConnection() {
  let listener: ((event: { data: string }) => void) | undefined;
  const dataChannel: RealtimeDataChannel & { emit: (event: unknown) => void; close: ReturnType<typeof vi.fn> } = {
    addEventListener: vi.fn((_type, nextListener) => {
      listener = nextListener;
    }),
    close: vi.fn(),
    emit: (event) => listener?.({ data: JSON.stringify(event) }),
  };
  const peerConnection: RealtimePeerConnection & { close: ReturnType<typeof vi.fn> } = {
    addTrack: vi.fn(),
    createDataChannel: vi.fn(() => dataChannel),
    createOffer: vi.fn().mockResolvedValue({ type: "offer", sdp: "local-sdp" }),
    setLocalDescription: vi.fn().mockResolvedValue(undefined),
    setRemoteDescription: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  };

  return { dataChannel, peerConnection };
}

async function connectClient() {
  const media = createMediaStream();
  const peer = makePeerConnection();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response({ value: "ephemeral-token" }))
    .mockResolvedValueOnce(response({}, { text: "answer-sdp" }));
  const transcripts: string[] = [];
  const client = new RealtimeTranscriptionClient({
    createPeerConnection: () => peer.peerConnection,
    fetch: fetcher,
    getUserMedia: vi.fn().mockResolvedValue(media.stream),
    onTranscript: ({ text }) => transcripts.push(text),
  });

  await client.connect();
  return { client, fetcher, media, peer, transcripts };
}

describe("RealtimeTranscriptionClient", () => {
  it("keeps the required receiver when using the browser fetch implementation", async () => {
    const originalFetch = globalThis.fetch;
    const media = createMediaStream();
    const peer = makePeerConnection();
    let fetchCount = 0;
    const fetcher = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) {
        throw new TypeError("Window.fetch requires a Window receiver");
      }

      fetchCount += 1;
      return Promise.resolve(
        fetchCount === 1
          ? response({ value: "ephemeral-token" })
          : response({}, { text: "answer-sdp" }),
      );
    }) as unknown as typeof fetch;
    globalThis.fetch = fetcher;

    try {
      const client = new RealtimeTranscriptionClient({
        createPeerConnection: () => peer.peerConnection,
        getUserMedia: vi.fn().mockResolvedValue(media.stream),
      });

      await client.connect();

      expect(client.getState()).toBe("listening");
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses one connection attempt when Connect is requested repeatedly", async () => {
    const connected = await connectClient();

    await connected.client.connect();

    expect(connected.fetcher).toHaveBeenCalledTimes(2);
    expect(connected.fetcher).toHaveBeenNthCalledWith(
      2,
      "https://api.openai.com/v1/realtime/calls",
      expect.objectContaining({
        method: "POST",
        body: "local-sdp",
        headers: {
          Authorization: "Bearer ephemeral-token",
          "Content-Type": "application/sdp",
        },
      }),
    );
    expect(connected.peer.peerConnection.createDataChannel).toHaveBeenCalledTimes(1);
    expect(connected.client.getState()).toBe("listening");
  });

  it("emits each completed provider item only once", async () => {
    const connected = await connectClient();
    const event = {
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item-1",
      transcript: "run tests",
    };

    connected.peer.dataChannel.emit(event);
    connected.peer.dataChannel.emit(event);

    expect(connected.transcripts).toEqual(["run tests"]);
  });

  it("releases every resource once and ignores events after Disconnect", async () => {
    const connected = await connectClient();

    connected.client.disconnect();
    connected.client.disconnect();
    connected.peer.dataChannel.emit({
      type: "conversation.item.input_audio_transcription.completed",
      item_id: "item-2",
      transcript: "undo",
    });

    expect(connected.media.track.stop).toHaveBeenCalledTimes(1);
    expect(connected.peer.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(connected.peer.peerConnection.close).toHaveBeenCalledTimes(1);
    expect(connected.transcripts).toEqual([]);
    expect(connected.client.getState()).toBe("idle");
  });

  it("supports two start and stop cycles without retaining an active microphone session", async () => {
    const firstMedia = createMediaStream();
    const secondMedia = createMediaStream();
    const firstPeer = makePeerConnection();
    const secondPeer = makePeerConnection();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ value: "first-token" }))
      .mockResolvedValueOnce(response({}, { text: "first-answer-sdp" }))
      .mockResolvedValueOnce(response({ value: "second-token" }))
      .mockResolvedValueOnce(response({}, { text: "second-answer-sdp" }));
    const client = new RealtimeTranscriptionClient({
      createPeerConnection: vi.fn().mockReturnValueOnce(firstPeer.peerConnection).mockReturnValueOnce(secondPeer.peerConnection),
      fetch: fetcher,
      getUserMedia: vi.fn().mockResolvedValueOnce(firstMedia.stream).mockResolvedValueOnce(secondMedia.stream),
    });

    await client.connect();
    client.disconnect();
    await client.connect();
    client.disconnect();

    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(firstMedia.track.stop).toHaveBeenCalledTimes(1);
    expect(secondMedia.track.stop).toHaveBeenCalledTimes(1);
    expect(firstPeer.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(secondPeer.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(firstPeer.peerConnection.close).toHaveBeenCalledTimes(1);
    expect(secondPeer.peerConnection.close).toHaveBeenCalledTimes(1);
    expect(client.getState()).toBe("idle");
  });

  it("invalidates a Connect attempt when Disconnect happens before credentials arrive", async () => {
    const tokenResponse = deferred<Response>();
    const createPeerConnection = vi.fn(() => makePeerConnection().peerConnection);
    const getUserMedia = vi.fn();
    const client = new RealtimeTranscriptionClient({
      createPeerConnection,
      fetch: vi.fn().mockReturnValue(tokenResponse.promise),
      getUserMedia,
    });

    const connecting = client.connect();
    client.disconnect();
    tokenResponse.resolve(response({ value: "late-token" }));
    await connecting;

    expect(createPeerConnection).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(client.getState()).toBe("idle");
  });

  it("stops a late microphone stream when Disconnect happens while permission is pending", async () => {
    const media = createMediaStream();
    const microphone = deferred<MediaStream>();
    const microphoneRequested = deferred<void>();
    const peer = makePeerConnection();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ value: "ephemeral-token" }));
    const client = new RealtimeTranscriptionClient({
      createPeerConnection: () => peer.peerConnection,
      fetch: fetcher,
      getUserMedia: vi.fn(() => {
        microphoneRequested.resolve(undefined);
        return microphone.promise;
      }),
    });

    const connecting = client.connect();
    await microphoneRequested.promise;
    client.disconnect();
    microphone.resolve(media.stream);
    await connecting;

    expect(media.track.stop).toHaveBeenCalledTimes(1);
    expect(peer.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peer.peerConnection.close).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(client.getState()).toBe("idle");
  });

  it("cleans up a failed negotiation and allows a later retry", async () => {
    const failedMedia = createMediaStream();
    const retriedMedia = createMediaStream();
    const failedPeer = makePeerConnection();
    const retriedPeer = makePeerConnection();
    const states: string[] = [];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ value: "ephemeral-token" }))
      .mockResolvedValueOnce(response({ error: "bad gateway" }, { ok: false }))
      .mockResolvedValueOnce(response({ value: "retry-token" }))
      .mockResolvedValueOnce(response({}, { text: "retry-answer-sdp" }));
    const client = new RealtimeTranscriptionClient({
      createPeerConnection: vi.fn()
        .mockReturnValueOnce(failedPeer.peerConnection)
        .mockReturnValueOnce(retriedPeer.peerConnection),
      fetch: fetcher,
      getUserMedia: vi.fn().mockResolvedValueOnce(failedMedia.stream).mockResolvedValueOnce(retriedMedia.stream),
      onStateChange: (state) => states.push(state),
    });

    await client.connect();

    expect(failedMedia.track.stop).toHaveBeenCalledTimes(1);
    expect(failedPeer.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(failedPeer.peerConnection.close).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["connecting", "error"]);
    expect(client.getState()).toBe("error");

    await client.connect();

    expect(client.getState()).toBe("listening");
    expect(states).toEqual(["connecting", "error", "connecting", "listening"]);
    expect(retriedMedia.track.stop).not.toHaveBeenCalled();
    expect(retriedPeer.dataChannel.close).not.toHaveBeenCalled();
    expect(retriedPeer.peerConnection.close).not.toHaveBeenCalled();
  });

  it("cleans up the peer connection when microphone permission is denied", async () => {
    const peer = makePeerConnection();
    const states: Array<{ state: string; error?: string }> = [];
    const client = new RealtimeTranscriptionClient({
      createPeerConnection: () => peer.peerConnection,
      fetch: vi.fn().mockResolvedValue(response({ value: "ephemeral-token" })),
      getUserMedia: vi.fn().mockRejectedValue(new Error("Permission denied")),
      onStateChange: (state, error) => states.push({ state, error }),
    });

    await client.connect();

    expect(peer.dataChannel.close).toHaveBeenCalledTimes(1);
    expect(peer.peerConnection.close).toHaveBeenCalledTimes(1);
    expect(states).toEqual([
      { state: "connecting", error: undefined },
      { state: "error", error: "Permission denied" },
    ]);
    expect(client.getState()).toBe("error");
  });
});

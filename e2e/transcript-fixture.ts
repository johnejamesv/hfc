import { expect, type Page } from "@playwright/test";

declare global {
  interface Window {
    emitCompletedTranscript?: (id: string, text: string) => void;
  }
}

/**
 * Replaces only microphone/WebRTC transport. Completed turns still pass through the real
 * transcription client, router, queue, editor dispatcher, proposal UI, and Python runner.
 */
export async function installTranscriptTransport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type MessageListener = (event: { data: string }) => void;
    let listener: MessageListener | undefined;

    class FakePeerConnection {
      addTrack() {}
      createDataChannel() {
        return {
          addEventListener: (_type: string, nextListener: MessageListener) => { listener = nextListener; },
          close() {},
        };
      }
      async createOffer() { return { type: "offer", sdp: "mock-offer" }; }
      async setLocalDescription() {}
      async setRemoteDescription() {}
      close() {}
    }

    Object.defineProperty(window, "RTCPeerConnection", { configurable: true, value: FakePeerConnection });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
    });
    window.emitCompletedTranscript = (id, text) => listener?.({
      data: JSON.stringify({
        type: "conversation.item.input_audio_transcription.completed",
        item_id: id,
        transcript: text,
      }),
    });
  });

  await page.route("**/api/realtime-token", (route) => route.fulfill({ json: { value: "mock-credential" } }));
  await page.route("https://api.openai.com/v1/realtime/calls", (route) => route.fulfill({ body: "mock-answer" }));
}

export async function startTranscriptSession(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Start listening" }).click();
  await expect(page.getByRole("region", { name: "Voice transcript status" })).toContainText("listening");
}

export async function emitTranscript(page: Page, id: string, text: string): Promise<void> {
  await sendTranscript(page, id, text);
  await expect(page.getByRole("region", { name: "Voice transcript status" })).toContainText(text);
}

export async function sendTranscript(page: Page, id: string, text: string): Promise<void> {
  await page.evaluate(({ nextId, nextText }) => {
    if (!window.emitCompletedTranscript) throw new Error("Transcript transport is not connected");
    window.emitCompletedTranscript(nextId, nextText);
  }, { nextId: id, nextText: text });
}

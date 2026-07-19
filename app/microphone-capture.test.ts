import { afterEach, describe, expect, it, vi } from "vitest";
import { getMicrophoneStream } from "./microphone-capture";

describe("getMicrophoneStream", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("explains that microphone capture needs HTTPS when MediaDevices is unavailable", () => {
    vi.stubGlobal("navigator", { mediaDevices: undefined });

    expect(() => getMicrophoneStream()).toThrow(
      "Microphone access requires a trusted HTTPS connection. Reopen this app with an https:// URL and try again.",
    );
  });

  it("requests an audio stream when MediaDevices is available", async () => {
    const stream = {} as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });

    await expect(getMicrophoneStream()).resolves.toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  });
});

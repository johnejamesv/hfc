const SECURE_CONTEXT_ERROR =
  "Microphone access requires a trusted HTTPS connection. Reopen this app with an https:// URL and try again.";

export function getMicrophoneStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(SECURE_CONTEXT_ERROR);
  }

  return navigator.mediaDevices.getUserMedia({ audio: true });
}

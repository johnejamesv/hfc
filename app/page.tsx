import { Playground } from "./playground";

export default function Home() {
  const configuredKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
  const voiceMode =
    process.env.HFC_VOICE_MODE === "realtime" || process.env.HFC_VOICE_MODE === "recording"
      ? process.env.HFC_VOICE_MODE
      : process.env.OPENROUTER_API_KEY || configuredKey?.startsWith("sk-or-")
        ? "recording"
        : "realtime";

  return <Playground voiceMode={voiceMode} />;
}

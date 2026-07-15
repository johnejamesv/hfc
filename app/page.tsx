import { Playground } from "./playground";

export default function Home() {
  const configuredKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
  const voiceMode =
    process.env.OPENROUTER_API_KEY || configuredKey?.startsWith("sk-or-") ? "recording" : "realtime";

  return <Playground voiceMode={voiceMode} />;
}

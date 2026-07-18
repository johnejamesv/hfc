import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hands-Free Code",
    short_name: "HFC",
    description: "A voice-first Python challenge playground.",
    start_url: "/",
    display: "standalone",
    background_color: "#07110f",
    theme_color: "#0d1715",
    icons: [
      { src: "/icon.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("web app manifest", () => {
  it("declares installable standalone metadata and icons", () => {
    expect(manifest()).toMatchObject({
      name: "Hands-Free Code",
      short_name: "HFC",
      start_url: "/",
      display: "standalone",
      background_color: "#07110f",
      theme_color: "#0d1715",
      icons: expect.arrayContaining([
        expect.objectContaining({ src: "/icon.svg", sizes: "192x192" }),
        expect.objectContaining({ src: "/icon.svg", sizes: "512x512" }),
      ]),
    });
  });
});

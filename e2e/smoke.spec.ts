import { expect, test } from "@playwright/test";

async function mockRealtimeTranscription(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    type MessageListener = (event: { data: string }) => void;
    let listener: MessageListener | undefined;
    const appWindow = window as typeof window & {
      emitCompletedTranscript?: (id: string, text: string) => void;
    };

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
    appWindow.emitCompletedTranscript = (id, text) => listener?.({
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

test("shows a usable playground without horizontal page scrolling", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Find a matching pair" })).toBeVisible();
  const selector = page.getByRole("combobox", { name: "Challenge" });
  const editor = page.getByRole("textbox", { name: "Python code editor" });
  await expect(selector).toHaveValue("pair-sum");
  await expect(editor).toBeVisible();
  await expect(page.getByText("def pair_sum(nums, target):")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start listening" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Editor controls" })).toBeVisible();

  await editor.fill("custom_pair_solution");
  await selector.selectOption("vowel-count");
  await expect(page.getByRole("heading", { name: "Count the vowels" })).toBeVisible();
  await page.getByRole("textbox", { name: "Python code editor" }).fill("custom_vowel_solution");
  await selector.selectOption("pair-sum");
  await expect(page.getByRole("textbox", { name: "Python code editor" })).toHaveText(
    "custom_pair_solution",
  );

  page.once("dialog", async (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("textbox", { name: "Python code editor" })).toHaveText(
    "custom_pair_solution",
  );

  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("def pair_sum(nums, target):")).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
});

test("runs the bundled Python cases without blocking the editor", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Python code editor" });
  await editor.fill(`def pair_sum(nums, target):
    seen = {}
    for index, value in enumerate(nums):
        needed = target - value
        if needed in seen:
            return [seen[needed], index]
        seen[value] = index
    return []`);

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("list", { name: "Test results" })).toContainText("Pass · finds a pair near the front", { timeout: 60_000 });
  await expect(page.getByRole("list", { name: "Test results" })).toContainText("Pass · supports negative values");
});

test("rehearses challenge selection, voice editing, mocked AI review, and test execution", async ({ page }) => {
  test.setTimeout(90_000);
  await mockRealtimeTranscription(page);
  await page.route("**/api/edit", (route) => route.fulfill({
    json: {
      replacement: `def pair_sum(nums, target):
    seen = {}
    for index, value in enumerate(nums):
        needed = target - value
        if needed in seen:
            return [seen[needed], index]
        seen[value] = index
    return []`,
      explanation: "Use a lookup table to find the matching pair.",
    },
  }));

  await page.goto("/");
  const selector = page.getByRole("combobox", { name: "Challenge" });
  await selector.selectOption("vowel-count");
  await expect(page.getByRole("heading", { name: "Count the vowels" })).toBeVisible();
  await selector.selectOption("pair-sum");

  await page.getByRole("button", { name: "Start listening" }).click();
  await expect(page.getByRole("region", { name: "Voice transcript status" })).toContainText("listening");
  await page.evaluate(() => (window as typeof window & { emitCompletedTranscript: (id: string, text: string) => void })
    .emitCompletedTranscript("select-all", "select lines 1 through 3"));
  await page.evaluate(() => (window as typeof window & { emitCompletedTranscript: (id: string, text: string) => void })
    .emitCompletedTranscript("edit-request", "change use a lookup table"));

  await expect(page.getByRole("heading", { name: "Review before applying" })).toBeVisible();
  await expect(page.getByText("Use a lookup table to find the matching pair.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByRole("textbox", { name: "Python code editor" })).toContainText("seen = {}");

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("list", { name: "Test results" })).toContainText("Pass · supports negative values", { timeout: 60_000 });
  await page.getByRole("button", { name: "Stop listening" }).click();
  await expect(page.getByRole("region", { name: "Voice transcript status" })).toContainText("idle");
});

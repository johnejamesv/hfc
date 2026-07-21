import { expect, test } from "@playwright/test";
import { emitTranscript, installTranscriptTransport, startTranscriptSession } from "./transcript-fixture";

test("shows a usable playground without horizontal page scrolling", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Contains a duplicate" })).toBeVisible();
  const selector = page.getByRole("combobox", { name: "Challenge" });
  const editor = page.getByRole("textbox", { name: "Python code editor" });
  await expect(selector).toHaveValue("contains-duplicate");
  await expect(editor).toBeVisible();
  await expect(page.getByText("def contains_duplicate(nums):")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start listening" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Editor controls" })).toBeVisible();

  await editor.fill("custom_duplicate_solution");
  await selector.selectOption("valid-anagram");
  await expect(page.getByRole("heading", { name: "Check an anagram" })).toBeVisible();
  await page.getByRole("textbox", { name: "Python code editor" }).fill("custom_anagram_solution");
  await selector.selectOption("contains-duplicate");
  await expect(page.getByRole("textbox", { name: "Python code editor" })).toHaveText(
    "custom_duplicate_solution",
  );

  page.once("dialog", async (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("textbox", { name: "Python code editor" })).toHaveText(
    "custom_duplicate_solution",
  );

  page.once("dialog", async (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("def contains_duplicate(nums):")).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
});

test("runs the bundled Python cases without blocking the editor", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Challenge" }).selectOption("pair-sum");
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
  await installTranscriptTransport(page);
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

  await startTranscriptSession(page);
  await emitTranscript(page, "select-all", "select lines 1 through 3");
  await emitTranscript(page, "edit-request", "change use a lookup table");

  await expect(page.getByRole("heading", { name: "Review before applying" })).toBeVisible();
  await expect(page.getByText("Use a lookup table to find the matching pair.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply change" }).click();
  await expect(page.getByRole("textbox", { name: "Python code editor" })).toContainText("seen = {}");

  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("list", { name: "Test results" })).toContainText("Pass · supports negative values", { timeout: 60_000 });
  await page.getByRole("button", { name: "Stop listening" }).click();
  await expect(page.getByRole("region", { name: "Voice transcript status" })).toContainText("idle");
});

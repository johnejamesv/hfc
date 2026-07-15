import { expect, test } from "@playwright/test";

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

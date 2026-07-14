import { expect, test } from "@playwright/test";

test("shows a usable playground without horizontal page scrolling", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Find a matching pair" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start listening" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Editor controls" })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
});

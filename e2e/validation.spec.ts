import { expect, test, type Page } from "@playwright/test";
import {
  emitTranscript,
  installTranscriptTransport,
  sendTranscript,
  startTranscriptSession,
} from "./transcript-fixture";

const pairSolution = `def pair_sum(nums, target):
    seen = {}
    for index, value in enumerate(nums):
        needed = target - value
        if needed in seen:
            return [seen[needed], index]
        seen[value] = index
    return []`;

const challengeSolutions = {
  "contains-duplicate": `def contains_duplicate(nums):
    return len(nums) != len(set(nums))`,
  "valid-anagram": `def is_anagram(s, t):
    return sorted(s) == sorted(t)`,
  "pair-sum": pairSolution,
  "vowel-count": `def count_vowels(text):
    return sum(1 for char in text.lower() if char in "aeiou")`,
  "steady-rises": `def longest_rise(values):
    if not values:
        return 0
    best = current = 1
    for index in range(1, len(values)):
        current = current + 1 if values[index] > values[index - 1] else 1
        best = max(best, current)
    return best`,
} as const;

async function openWithTranscriptSession(page: Page): Promise<void> {
  await installTranscriptTransport(page);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Challenge" }).selectOption("pair-sum");
  await startTranscriptSession(page);
}

test("validates responsive shell, deterministic transcript editing, deduplication, and persistence", async ({ page }, testInfo) => {
  await openWithTranscriptSession(page);
  const editor = page.getByRole("textbox", { name: "Python code editor" });
  const original = `def pair_sum(nums, target):
    # Return the two matching indices.
    return []`;

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBe(dimensions.clientWidth);
  if (testInfo.project.name === "mobile-webkit") {
    const controlSizes = await page.getByRole("navigation", { name: "Editor controls" }).locator("button").evaluateAll(
      (buttons) => buttons.map((button) => ({ width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height })),
    );
    expect(controlSizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
  }

  await emitTranscript(page, "select-comment", "select line 2");
  await emitTranscript(page, "dictate-total", "type total equals zero");
  await expect(editor).toHaveText("def pair_sum(nums, target):\ntotal = zero\n    return []");
  await emitTranscript(page, "undo-total", "undo");
  await expect(editor).toHaveText(original);
  await emitTranscript(page, "redo-total", "redo");
  await expect(editor).toContainText("total = zero");

  await emitTranscript(page, "select-total", "select line 2");
  await emitTranscript(page, "deduplicated-pass", "type pass");
  await emitTranscript(page, "deduplicated-pass", "type pass");
  await expect(editor).toHaveText("def pair_sum(nums, target):\npass\n    return []");
  await expect(page.getByRole("list", { name: "Completed transcripts" }).getByText("type pass", { exact: true })).toHaveCount(1);

  await emitTranscript(page, "invalid-line", "select line 99");
  await expect(page.locator("p.action-error")).toHaveText("Invalid line range");
  await expect(editor).toHaveText("def pair_sum(nums, target):\npass\n    return []");
  await emitTranscript(page, "unknown-command", "please frobnicate this");
  await expect(page.getByRole("region", { name: "Voice transcript status" })).toContainText("I didn't understand that command.");

  await page.getByRole("combobox", { name: "Challenge" }).selectOption("vowel-count");
  await page.getByRole("textbox", { name: "Python code editor" }).fill("saved_vowel_source");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Challenge" })).toHaveValue("vowel-count");
  await expect(page.getByRole("textbox", { name: "Python code editor" })).toHaveText("saved_vowel_source");
  const storage = await page.evaluate(() => ({ ...localStorage }));
  expect(Object.keys(storage)).toEqual(["hfc-progress"]);
  expect(storage["hfc-progress"]).not.toContain("please frobnicate this");
});

test("validates AI rejection, discard, apply, write, and malformed-response recovery", async ({ page }) => {
  let responseNumber = 0;
  await installTranscriptTransport(page);
  await page.route("**/api/edit", async (route) => {
    responseNumber += 1;
    if (responseNumber === 4) {
      await route.fulfill({ json: { replacement: 42, explanation: "invalid" } });
      return;
    }
    const proposals = [
      { replacement: "discarded", explanation: "Discard this proposal." },
      { replacement: pairSolution, explanation: "Apply a lookup-table solution." },
      { replacement: "# inserted by write\n", explanation: "Insert a comment at the cursor." },
    ];
    await route.fulfill({ json: proposals[responseNumber - 1] });
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Challenge" }).selectOption("pair-sum");
  await startTranscriptSession(page);
  const editor = page.getByRole("textbox", { name: "Python code editor" });
  const original = await editor.textContent();

  await emitTranscript(page, "collapsed-change", "change use a dictionary");
  await expect(page.locator("p.action-error")).toContainText("Select code before asking HFC to change it.");
  expect(responseNumber).toBe(0);

  await emitTranscript(page, "discard-select", "select lines 1 through 3");
  await emitTranscript(page, "discard-request", "change make this wrong");
  await expect(page.getByRole("heading", { name: "Review before applying" })).toBeVisible();
  await emitTranscript(page, "discard-control", "discard");
  await expect(page.getByRole("heading", { name: "Review before applying" })).toBeHidden();
  await expect(editor).toHaveText(original ?? "");

  await emitTranscript(page, "apply-select", "select lines 1 through 3");
  await emitTranscript(page, "apply-request", "change use a lookup table");
  await emitTranscript(page, "apply-control", "apply");
  await expect(editor).toHaveText(pairSolution);

  await emitTranscript(page, "write-position", "go to line 1");
  await emitTranscript(page, "write-request", "write a short comment");
  await emitTranscript(page, "write-apply", "apply");
  await expect(editor.locator(".cm-line").first()).toHaveText("# inserted by write");
  await expect(editor.locator(".cm-line").nth(1)).toHaveText("def pair_sum(nums, target):");

  const recoverableSource = await editor.textContent();
  await emitTranscript(page, "bad-write", "write malformed output");
  await expect(page.locator("p.action-error")).toContainText("invalid proposal");
  await expect(editor).toHaveText(recoverableSource ?? "");
});

test("serializes delayed AI, Apply, and real Python Run, then gives Stop priority", async ({ page }) => {
  test.setTimeout(120_000);
  let requestCount = 0;
  await installTranscriptTransport(page);
  await page.route("**/api/edit", async (route) => {
    requestCount += 1;
    await new Promise((resolve) => setTimeout(resolve, requestCount === 2 ? 3_000 : 350));
    await route.fulfill({ json: { replacement: pairSolution, explanation: "Delayed deterministic proposal." } });
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Challenge" }).selectOption("pair-sum");
  await startTranscriptSession(page);
  const editor = page.getByRole("textbox", { name: "Python code editor" });

  await emitTranscript(page, "queued-select", "select lines 1 through 3");
  await sendTranscript(page, "queued-change", "change use a lookup table");
  await sendTranscript(page, "queued-apply", "apply");
  await sendTranscript(page, "queued-run", "run tests");
  await expect(editor).toHaveText(pairSolution);
  await expect(page.locator("details.test-results")).toContainText("3/3 tests passed", { timeout: 90_000 });
  await expect(page.getByRole("status").filter({ hasText: "Test run completed." })).toBeVisible();

  await emitTranscript(page, "stop-select", "select line 1");
  await sendTranscript(page, "stop-change", "change delay this request");
  await sendTranscript(page, "cleared-mutation", "type should_not_appear");
  await sendTranscript(page, "priority-stop", "stop listening");
  await expect(page.getByRole("region", { name: "Voice transcript status" })).toContainText("idle");
  await expect(editor).not.toContainText("should_not_appear");
  expect(requestCount).toBe(2);
});

test("solves both primary challenges with deterministic transcript dictation", async ({ page }) => {
  test.setTimeout(180_000);
  await installTranscriptTransport(page);
  await page.goto("/");
  await startTranscriptSession(page);
  const selector = page.getByRole("combobox", { name: "Challenge" });
  const editor = page.getByRole("textbox", { name: "Python code editor" });

  await emitTranscript(page, "duplicate-line", "select line 3");
  await emitTranscript(
    page,
    "duplicate-solution",
    "type return len open paren nums close paren not equals len open paren set open paren nums close paren close paren",
  );
  await expect(editor).toContainText("return len(nums) != len(set(nums))");
  await sendTranscript(page, "duplicate-run", "run tests");
  await expect(page.getByRole("list", { name: "Test results" })).toContainText(
    "finds a separated duplicate",
    { timeout: 90_000 },
  );

  await selector.selectOption("valid-anagram");
  await emitTranscript(page, "anagram-line", "select line 3");
  await emitTranscript(
    page,
    "anagram-solution",
    "type return sorted open paren s close paren double equals sorted open paren t close paren",
  );
  await expect(editor).toContainText("return sorted(s) == sorted(t)");
  await sendTranscript(page, "anagram-run", "run tests");
  await expect(page.getByRole("list", { name: "Test results" })).toContainText(
    "accepts reordered characters",
    { timeout: 90_000 },
  );
});

test("runs every challenge and recovers after syntax, runtime, and timeout failures", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  const selector = page.getByRole("combobox", { name: "Challenge" });

  const expectedTestName = {
    "contains-duplicate": "finds a separated duplicate",
    "valid-anagram": "accepts reordered characters",
    "pair-sum": "finds a pair near the front",
    "vowel-count": "counts mixed-case text",
    "steady-rises": "finds the longest internal rise",
  } as const;

  for (const [challenge, source] of Object.entries(challengeSolutions)) {
    await selector.selectOption(challenge);
    const editor = page.getByRole("textbox", { name: "Python code editor" });
    await editor.fill(source);
    await page.getByRole("button", { name: "Run" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Tests running." })).toBeVisible();
    await expect(page.getByRole("list", { name: "Test results" })).toContainText(
      expectedTestName[challenge as keyof typeof expectedTestName],
      { timeout: 90_000 },
    );
  }

  await selector.selectOption("pair-sum");
  const editor = page.getByRole("textbox", { name: "Python code editor" });
  await editor.fill("def pair_sum(nums, target)\n    return []");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.locator("details.test-results [role=alert]")).toContainText("SyntaxError", { timeout: 30_000 });

  await editor.fill("def pair_sum(nums, target):\n    raise ValueError('expected runtime failure')");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.locator("details.test-results [role=alert]")).toContainText("ValueError", { timeout: 30_000 });

  await editor.fill("def pair_sum(nums, target):\n    while True:\n        pass");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.locator("details.test-results [role=alert]")).toContainText("Tests exceeded three seconds", { timeout: 30_000 });

  await editor.fill(pairSolution);
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.locator("details.test-results")).toContainText("3/3 tests passed", { timeout: 90_000 });
});

test("repeats the transcript-only primary rehearsal three times without editor input", async ({ page }) => {
  test.setTimeout(180_000);
  let proposalNumber = 0;
  await installTranscriptTransport(page);
  await page.route("**/api/edit", (route) => {
    proposalNumber += 1;
    return route.fulfill({
      json: {
        replacement: `print("rehearsal ${proposalNumber}")\n${pairSolution}`,
        explanation: "Use a lookup table.",
      },
    });
  });
  await page.goto("/");
  await page.getByRole("combobox", { name: "Challenge" }).selectOption("pair-sum");
  await startTranscriptSession(page);
  const editor = page.getByRole("textbox", { name: "Python code editor" });

  for (let run = 1; run <= 3; run += 1) {
    await emitTranscript(page, `select-${run}`, "select lines 1 through 3");
    await emitTranscript(page, `change-${run}`, "change use a lookup table");
    await emitTranscript(page, `apply-${run}`, "apply");
    await expect(editor.locator(".cm-line").first()).toHaveText(`print("rehearsal ${run}")`);
    await expect(editor).toContainText(pairSolution);
    await sendTranscript(page, `run-${run}`, "run tests");
    await expect(page.locator("details.test-results")).toContainText("3/3 tests passed", { timeout: 90_000 });
    await expect(page.getByLabel("Python output")).toContainText(`rehearsal ${run}`);
    await expect(page.getByRole("status").filter({ hasText: "Test run completed." })).toBeVisible();
    if (run < 3) {
      await emitTranscript(page, `undo-${run}`, "undo");
      await expect(editor).toHaveText(`def pair_sum(nums, target):\n    # Return the two matching indices.\n    return []`);
    }
  }

  await emitTranscript(page, "final-stop", "stop listening");
  await expect(page.getByRole("region", { name: "Voice transcript status" })).toContainText("idle");
});

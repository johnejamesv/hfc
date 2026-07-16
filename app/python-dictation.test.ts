import { describe, expect, it } from "vitest";
import { normalizePythonDictation } from "./python-dictation";

describe("Python literal dictation", () => {
  it.each([
    ["return nums open bracket 0 close bracket", "return nums[0]"],
    ["if left less than or equal right colon", "if left <= right:"],
    ["result equals pair_sum open paren nums comma target close paren", "result = pair_sum(nums, target)"],
    ["for item in nums colon new line indent return item", "for item in nums:\n    return item"],
    ["if value double equals None colon new line indent return False new line dedent return True", "if value == None:\n    return False\nreturn True"],
  ])("normalizes the normative fixture %s", (spoken, expected) => {
    expect(normalizePythonDictation(spoken)).toBe(expected);
  });

  it.each([
    ["value comma next", "value, next"],
    ["object dot method open paren close paren", "object.method()"],
    ["items open brace key colon value close brace", "items{key: value}"],
    ["left equals right", "left = right"],
    ["left not equals right", "left != right"],
    ["left less than right", "left < right"],
    ["left greater than or equal right", "left >= right"],
    ["left plus right minus one times two divided by three modulo four", "left + right - one * two / three % four"],
    ["def return for while if elif else in range enumerate", "def return for while if elif else in range enumerate"],
    ["true false none", "True False None"],
  ])("supports documented vocabulary: %s", (spoken, expected) => {
    expect(normalizePythonDictation(spoken)).toBe(expected);
  });

  it("matches known phrases case-insensitively, longest first, while preserving unknown spelling", () => {
    expect(normalizePythonDictation("MyVariable LESS THAN OR EQUAL OtherThing")).toBe("MyVariable <= OtherThing");
  });

  it("applies layout relative to the supplied insertion indentation", () => {
    expect(normalizePythonDictation("for item in nums colon new line indent return item", "  ")).toBe(
      "  for item in nums:\n      return item",
    );
    expect(normalizePythonDictation("indent new line dedent return value", "  ")).toBe("      \n  return value");
  });
});

export type ChallengeId =
  | "contains-duplicate"
  | "valid-anagram"
  | "pair-sum"
  | "vowel-count"
  | "steady-rises";

export type ChallengeValue =
  | null
  | boolean
  | number
  | string
  | readonly ChallengeValue[];

export interface ChallengeExample {
  readonly input: string;
  readonly output: string;
  readonly note?: string;
}

export interface ChallengeTest {
  readonly name: string;
  readonly args: readonly ChallengeValue[];
  readonly expected: ChallengeValue;
}

export interface Challenge {
  readonly id: ChallengeId;
  readonly title: string;
  readonly summary: string;
  readonly prompt: string;
  readonly functionName: string;
  readonly starterCode: string;
  readonly examples: readonly ChallengeExample[];
  readonly tests: readonly ChallengeTest[];
  readonly isDemo: boolean;
}

export const challenges: readonly Challenge[] = [
  {
    id: "contains-duplicate",
    title: "Contains a duplicate",
    summary: "Decide whether any integer occurs more than once.",
    prompt:
      "Return true when at least one value appears more than once in the list. Return false when every value is unique.",
    functionName: "contains_duplicate",
    starterCode: `def contains_duplicate(nums):
    # Check whether any value repeats.
    return False`,
    examples: [
      { input: "nums = [6, 1, 4, 6]", output: "True", note: "The value 6 appears twice." },
      { input: "nums = [3, 8, -2]", output: "False" },
    ],
    tests: [
      { name: "finds a separated duplicate", args: [[6, 1, 4, 6]], expected: true },
      { name: "accepts all unique values", args: [[3, 8, -2]], expected: false },
      { name: "finds adjacent duplicates", args: [[9, 9]], expected: true },
    ],
    isDemo: true,
  },
  {
    id: "valid-anagram",
    title: "Check an anagram",
    summary: "Compare two strings without caring about character order.",
    prompt:
      "Return true when both strings contain exactly the same characters with the same frequencies, regardless of order.",
    functionName: "is_anagram",
    starterCode: `def is_anagram(s, t):
    # Compare the character frequencies.
    return False`,
    examples: [
      { input: 's = "listen", t = "silent"', output: "True" },
      { input: 's = "paper", t = "pepper"', output: "False" },
    ],
    tests: [
      { name: "accepts reordered characters", args: ["listen", "silent"], expected: true },
      { name: "rejects different frequencies", args: ["paper", "pepper"], expected: false },
      { name: "accepts two empty strings", args: ["", ""], expected: true },
    ],
    isDemo: false,
  },
  {
    id: "pair-sum",
    title: "Find a matching pair",
    summary: "Return the two positions whose values reach a target sum.",
    prompt:
      "Given a list of integers and a target, return the indices of two different values whose sum equals the target. Exactly one matching pair exists.",
    functionName: "pair_sum",
    starterCode: `def pair_sum(nums, target):
    # Return the two matching indices.
    return []`,
    examples: [
      {
        input: "nums = [2, 7, 11, 15], target = 9",
        output: "[0, 1]",
        note: "2 + 7 reaches the target.",
      },
      {
        input: "nums = [4, 1, 6], target = 10",
        output: "[0, 2]",
      },
    ],
    tests: [
      { name: "finds a pair near the front", args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { name: "uses two different positions", args: [[3, 2, 4], 6], expected: [1, 2] },
      { name: "supports negative values", args: [[-5, 8, 2, 9], 3], expected: [0, 1] },
    ],
    isDemo: false,
  },
  {
    id: "vowel-count",
    title: "Count the vowels",
    summary: "Count English vowels without caring about letter case.",
    prompt:
      "Return how many characters in the given text are English vowels (a, e, i, o, or u). Uppercase and lowercase vowels count equally.",
    functionName: "count_vowels",
    starterCode: `def count_vowels(text):
    # Count both lowercase and uppercase vowels.
    return 0`,
    examples: [
      { input: 'text = "Hello, World!"', output: "3" },
      { input: 'text = "rhythm"', output: "0" },
    ],
    tests: [
      { name: "counts mixed-case text", args: ["Hello, World!"], expected: 3 },
      { name: "handles text without vowels", args: ["rhythm"], expected: 0 },
      { name: "handles an empty string", args: [""], expected: 0 },
    ],
    isDemo: false,
  },
  {
    id: "steady-rises",
    title: "Measure steady rises",
    summary: "Find the longest run of strictly increasing neighbors.",
    prompt:
      "Return the length of the longest contiguous run in which every number is greater than the number immediately before it. An empty list has length zero.",
    functionName: "longest_rise",
    starterCode: `def longest_rise(values):
    # Measure the longest contiguous increasing run.
    return 0`,
    examples: [
      { input: "values = [3, 4, 7, 2, 5]", output: "3", note: "The run [3, 4, 7] is longest." },
      { input: "values = [8, 8, 8]", output: "1" },
    ],
    tests: [
      { name: "finds the longest internal rise", args: [[3, 4, 7, 2, 5]], expected: 3 },
      { name: "does not count equal neighbors as rising", args: [[8, 8, 8]], expected: 1 },
      { name: "handles an empty list", args: [[]], expected: 0 },
    ],
    isDemo: false,
  },
];

export function getChallenge(id: ChallengeId): Challenge {
  const challenge = challenges.find((candidate) => candidate.id === id);

  if (!challenge) {
    throw new Error(`Unknown challenge: ${id}`);
  }

  return challenge;
}

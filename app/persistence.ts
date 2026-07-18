import { challenges, type ChallengeId } from "./challenges";

export const progressStorageKey = "hfc-progress";
export const progressSchemaVersion = 1;

export interface StoredProgress {
  readonly version: typeof progressSchemaVersion;
  readonly selectedId: ChallengeId;
  readonly solutions: Readonly<Record<ChallengeId, string>>;
}

export interface RestoredProgress {
  readonly selectedId: ChallengeId;
  readonly solutions: Readonly<Partial<Record<ChallengeId, string>>>;
}

const challengeIds = new Set<ChallengeId>(challenges.map((challenge) => challenge.id));

function isChallengeId(value: unknown): value is ChallengeId {
  return typeof value === "string" && challengeIds.has(value as ChallengeId);
}

export function restoreProgress(serialized: string | null): RestoredProgress | undefined {
  if (!serialized) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return undefined;
  }

  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.version !== progressSchemaVersion || !record.solutions || typeof record.solutions !== "object") {
    return undefined;
  }

  const solutions: Partial<Record<ChallengeId, string>> = {};
  for (const id of challengeIds) {
    const source = (record.solutions as Record<string, unknown>)[id];
    if (typeof source === "string") solutions[id] = source;
  }

  return {
    selectedId: isChallengeId(record.selectedId) ? record.selectedId : challenges[0].id,
    solutions,
  };
}

export function serializeProgress(selectedId: ChallengeId, solutions: Readonly<Record<ChallengeId, string>>): string {
  const progress: StoredProgress = {
    version: progressSchemaVersion,
    selectedId,
    solutions,
  };
  return JSON.stringify(progress);
}

export function readProgress(storage: Pick<Storage, "getItem">): RestoredProgress | undefined {
  try {
    return restoreProgress(storage.getItem(progressStorageKey));
  } catch {
    return undefined;
  }
}

export function writeProgress(
  storage: Pick<Storage, "setItem">,
  selectedId: ChallengeId,
  solutions: Readonly<Record<ChallengeId, string>>,
): void {
  try {
    storage.setItem(progressStorageKey, serializeProgress(selectedId, solutions));
  } catch {
    // Storage can be unavailable in private browsing; editing remains in-memory.
  }
}

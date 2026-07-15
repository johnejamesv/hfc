import type { ChallengeTest } from "./challenges";

export interface PythonTestResult {
  readonly name: string;
  readonly status: "passed" | "failed";
}

export interface PythonException {
  readonly type: string;
  readonly message: string;
}

export interface PythonRunRequest {
  readonly type: "run";
  readonly requestId: number;
  readonly source: string;
  readonly functionName: string;
  readonly tests: readonly ChallengeTest[];
}

export interface PythonCompletedResult {
  readonly type: "result";
  readonly requestId: number;
  readonly outcome: "completed";
  readonly stdout: string;
  readonly tests: readonly PythonTestResult[];
}

export interface PythonErrorResult {
  readonly type: "result";
  readonly requestId: number;
  readonly outcome: "error";
  readonly stdout: string;
  readonly exception: PythonException;
}

export type PythonWorkerResult = PythonCompletedResult | PythonErrorResult;

export type PythonWorkerMessage =
  | { readonly type: "ready" }
  | { readonly type: "loadError"; readonly message: string }
  | PythonWorkerResult;

export type PythonWorkerRequest = { readonly type: "initialize" } | PythonRunRequest;

export interface PythonTimeoutResult {
  readonly requestId: number;
  readonly outcome: "timeout";
}

export type PythonRunResult = PythonWorkerResult | PythonTimeoutResult;

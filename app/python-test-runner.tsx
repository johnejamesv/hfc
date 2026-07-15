"use client";

import { useEffect, useRef, useState } from "react";
import type { Challenge } from "./challenges";
import { PythonWorkerClient, type PythonRuntimeState, type WorkerLike } from "./python-worker-client";
import type { PythonRunResult } from "./python-worker-protocol";

interface PythonTestRunnerProps {
  readonly challenge: Challenge;
  readonly source: string;
  readonly runRequests: number;
}

function createWorker(): WorkerLike {
  return new Worker(new URL("./workers/python.worker.ts", import.meta.url), { type: "module" }) as unknown as WorkerLike;
}

export function PythonTestRunner({ challenge, source, runRequests }: PythonTestRunnerProps) {
  const [runtimeState, setRuntimeState] = useState<PythonRuntimeState>("loading");
  const [runtimeError, setRuntimeError] = useState<string>();
  const [result, setResult] = useState<PythonRunResult>();
  const client = useRef<PythonWorkerClient | undefined>(undefined);
  const processedRequests = useRef(0);

  useEffect(() => {
    if (typeof Worker === "undefined") {
      setRuntimeState("error");
      setRuntimeError("The Python runtime is unavailable in this browser.");
      return;
    }

    const nextClient = new PythonWorkerClient({
      createWorker,
      onStateChange: (state, error) => {
        setRuntimeState(state);
        setRuntimeError(error);
      },
      onResult: setResult,
    });
    client.current = nextClient;
    return () => nextClient.dispose();
  }, []);

  useEffect(() => {
    if (runRequests <= processedRequests.current) return;
    processedRequests.current = runRequests;
    setResult(undefined);
    client.current?.run({
      type: "run",
      requestId: runRequests,
      source,
      functionName: challenge.functionName,
      tests: challenge.tests,
    });
  }, [challenge, runRequests, source]);

  const summary = runtimeState === "loading"
    ? "Python runtime loading"
    : runtimeState === "error"
      ? "Python runtime unavailable"
      : result?.outcome === "timeout"
        ? "Tests timed out"
        : result?.outcome === "error"
          ? "Tests stopped with an error"
          : result?.outcome === "completed"
            ? `${result.tests.filter((test) => test.status === "passed").length}/${result.tests.length} tests passed`
            : "Test results";

  return (
    <details className="test-results" open>
      <summary>{summary}</summary>
      <div aria-live="polite">
        {runtimeState === "loading" ? <p>Loading the Python runtime…</p> : null}
        {runtimeState === "error" ? <p role="alert">{runtimeError}</p> : null}
        {result?.outcome === "timeout" ? <p role="alert">Tests exceeded three seconds. The Python runtime is restarting.</p> : null}
        {result?.outcome === "error" ? (
          <p role="alert">{result.exception.type}: {result.exception.message}</p>
        ) : null}
        {result?.outcome === "completed" ? (
          <ul aria-label="Test results">
            {result.tests.map((test) => <li key={test.name} data-status={test.status}>{test.status === "passed" ? "Pass" : "Fail"} · {test.name}</li>)}
          </ul>
        ) : null}
        {result && result.outcome !== "timeout" && result.stdout ? <pre aria-label="Python output">{result.stdout}</pre> : null}
      </div>
    </details>
  );
}

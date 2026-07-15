import { describe, expect, it, vi } from "vitest";
import { PythonWorkerClient, type WorkerLike } from "./python-worker-client";
import type { PythonRunRequest, PythonWorkerMessage } from "./python-worker-protocol";

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<PythonWorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();

  send(message: PythonWorkerMessage) {
    this.onmessage?.({ data: message } as MessageEvent<PythonWorkerMessage>);
  }
}

const request = (requestId: number, source = "def pair_sum(a, b): return []"): PythonRunRequest => ({
  type: "run", requestId, source, functionName: "pair_sum", tests: [],
});

describe("PythonWorkerClient", () => {
  it("queues a run until ready and presents stdout plus per-test pass/fail results", () => {
    const worker = new FakeWorker();
    const results: unknown[] = [];
    const client = new PythonWorkerClient({ createWorker: () => worker, onStateChange: vi.fn(), onResult: (result) => results.push(result) });
    client.run(request(1));
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "initialize" });
    worker.send({ type: "ready" });
    expect(worker.postMessage).toHaveBeenLastCalledWith(request(1));
    worker.send({ type: "result", requestId: 1, outcome: "completed", stdout: "checked\\n", tests: [{ name: "passes", status: "passed" }, { name: "assertion fails", status: "failed" }] });
    expect(results).toEqual([{ type: "result", requestId: 1, outcome: "completed", stdout: "checked\\n", tests: [{ name: "passes", status: "passed" }, { name: "assertion fails", status: "failed" }] }]);
    client.dispose();
  });

  it("returns structured syntax and runtime errors from worker messages", () => {
    const worker = new FakeWorker();
    const results: unknown[] = [];
    const client = new PythonWorkerClient({ createWorker: () => worker, onStateChange: vi.fn(), onResult: (result) => results.push(result) });
    worker.send({ type: "ready" });
    client.run(request(1, "def broken(:"));
    worker.send({ type: "result", requestId: 1, outcome: "error", stdout: "", exception: { type: "SyntaxError", message: "invalid syntax" } });
    client.run(request(2, "raise RuntimeError('boom')"));
    worker.send({ type: "result", requestId: 2, outcome: "error", stdout: "before failure\\n", exception: { type: "RuntimeError", message: "boom" } });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ outcome: "error", exception: { type: "SyntaxError" } });
    expect(results[1]).toMatchObject({ stdout: "before failure\\n", exception: { type: "RuntimeError" } });
    client.dispose();
  });

  it("replaces a timed-out worker, ignores its late reply, and runs normally after recovery", () => {
    vi.useFakeTimers();
    const first = new FakeWorker();
    const replacement = new FakeWorker();
    const workers = [first, replacement];
    const results: unknown[] = [];
    const client = new PythonWorkerClient({ createWorker: () => workers.shift()!, onStateChange: vi.fn(), onResult: (result) => results.push(result), timeoutMs: 3_000 });
    first.send({ type: "ready" });
    client.run(request(1, "while True: pass"));
    vi.advanceTimersByTime(3_000);
    expect(results).toEqual([{ requestId: 1, outcome: "timeout" }]);
    expect(first.terminate).toHaveBeenCalledOnce();
    first.send({ type: "result", requestId: 1, outcome: "completed", stdout: "", tests: [] });
    expect(results).toHaveLength(1);
    replacement.send({ type: "ready" });
    client.run(request(2));
    replacement.send({ type: "result", requestId: 2, outcome: "completed", stdout: "", tests: [{ name: "recovered", status: "passed" }] });
    expect(results).toHaveLength(2);
    expect(results[1]).toMatchObject({ requestId: 2, outcome: "completed" });
    client.dispose();
    vi.useRealTimers();
  });
});

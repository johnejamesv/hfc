import type {
  PythonRunRequest,
  PythonRunResult,
  PythonWorkerMessage,
  PythonWorkerRequest,
} from "./python-worker-protocol";

export type PythonRuntimeState = "loading" | "ready" | "error";

export interface WorkerLike {
  onmessage: ((event: MessageEvent<PythonWorkerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: PythonWorkerRequest): void;
  terminate(): void;
}

interface PythonWorkerClientOptions {
  readonly createWorker: () => WorkerLike;
  readonly onStateChange: (state: PythonRuntimeState, error?: string) => void;
  readonly onResult: (result: PythonRunResult) => void;
  readonly timeoutMs?: number;
}

export class PythonWorkerClient {
  private readonly timeoutMs: number;
  private worker: WorkerLike | undefined;
  private state: PythonRuntimeState = "loading";
  private activeRequestId: number | undefined;
  private pendingRequest: PythonRunRequest | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly options: PythonWorkerClientOptions) {
    this.timeoutMs = options.timeoutMs ?? 3_000;
    this.startWorker();
  }

  run(request: PythonRunRequest) {
    this.pendingRequest = request;
    if (this.state === "ready") this.postPendingRequest();
  }

  dispose() {
    if (this.timeout) clearTimeout(this.timeout);
    this.worker?.terminate();
    this.worker = undefined;
    this.activeRequestId = undefined;
    this.pendingRequest = undefined;
  }

  private startWorker() {
    this.worker?.terminate();
    this.state = "loading";
    this.options.onStateChange("loading");

    const worker = this.options.createWorker();
    this.worker = worker;
    worker.onmessage = (event) => this.handleMessage(worker, event.data);
    worker.onerror = () => this.failLoading("The Python runtime could not start.");
    worker.postMessage({ type: "initialize" });
  }

  private handleMessage(worker: WorkerLike, message: PythonWorkerMessage) {
    if (worker !== this.worker) return;

    if (message.type === "ready") {
      this.state = "ready";
      this.options.onStateChange("ready");
      this.postPendingRequest();
      return;
    }

    if (message.type === "loadError") {
      this.failLoading(message.message);
      return;
    }

    if (message.requestId !== this.activeRequestId) return;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = undefined;
    this.activeRequestId = undefined;
    this.options.onResult(message);
  }

  private postPendingRequest() {
    const request = this.pendingRequest;
    if (!request || !this.worker) return;

    if (this.timeout) clearTimeout(this.timeout);
    this.pendingRequest = undefined;
    this.activeRequestId = request.requestId;
    this.worker.postMessage(request);
    this.timeout = setTimeout(() => this.handleTimeout(request.requestId), this.timeoutMs);
  }

  private handleTimeout(requestId: number) {
    if (requestId !== this.activeRequestId) return;
    this.activeRequestId = undefined;
    this.timeout = undefined;
    this.options.onResult({ requestId, outcome: "timeout" });
    this.startWorker();
  }

  private failLoading(message: string) {
    this.state = "error";
    this.options.onStateChange("error", message);
  }
}

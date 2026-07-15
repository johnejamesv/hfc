import type {
  PythonException,
  PythonRunRequest,
  PythonWorkerMessage,
  PythonWorkerRequest,
} from "../python-worker-protocol";

interface PyodideRuntime {
  setStdout(options: { batched(text: string): void }): void;
  runPythonAsync(source: string): Promise<unknown>;
  globals: {
    set(name: string, value: unknown): void;
    get(name: string): unknown;
  };
}

interface PyodideModule {
  loadPyodide(options: { indexURL: string }): Promise<PyodideRuntime>;
}

const PYODIDE_BASE_URL = "https://cdn.jsdelivr.net/pyodide/v0.29.3/full/";
const PYODIDE_MODULE_URL = `${PYODIDE_BASE_URL}pyodide.mjs`;

const worker = self as unknown as {
  postMessage(message: PythonWorkerMessage): void;
  onmessage: ((event: MessageEvent<PythonWorkerRequest>) => void) | null;
};
let pyodidePromise: Promise<PyodideRuntime> | undefined;

function post(message: PythonWorkerMessage) {
  worker.postMessage(message);
}

function getPyodide() {
  pyodidePromise ??= import(/* webpackIgnore: true */ PYODIDE_MODULE_URL)
    .then((module) => (module as unknown as PyodideModule).loadPyodide({ indexURL: PYODIDE_BASE_URL }));
  return pyodidePromise;
}

function exceptionFrom(error: unknown): PythonException {
  const text = error instanceof Error ? error.message : String(error);
  const match = text.match(/(^|\n)([A-Za-z_][\w.]*?(?:Error|Exception|Exit)):\s*([^\n]*)/m);
  return {
    type: match?.[2] ?? (error instanceof Error ? error.name : "PythonError"),
    message: match?.[3] || text,
  };
}

async function run(request: PythonRunRequest) {
  let stdout = "";

  try {
    const pyodide = await getPyodide();
    pyodide.setStdout({ batched: (text) => { stdout += text; } });
    await pyodide.runPythonAsync(request.source);
    pyodide.globals.set("__hfc_function_name", request.functionName);
    pyodide.globals.set("__hfc_tests_json", JSON.stringify(request.tests));
    await pyodide.runPythonAsync(`
import json
__hfc_results = []
__hfc_function = globals()[__hfc_function_name]
for __hfc_test in json.loads(__hfc_tests_json):
    try:
        __hfc_actual = __hfc_function(*__hfc_test["args"])
        __hfc_passed = __hfc_actual == __hfc_test["expected"]
    except AssertionError:
        __hfc_passed = False
    __hfc_results.append({"name": __hfc_test["name"], "status": "passed" if __hfc_passed else "failed"})
__hfc_results_json = json.dumps(__hfc_results)
`);
    const resultsJson = pyodide.globals.get("__hfc_results_json");
    const tests = JSON.parse(String(resultsJson));
    post({ type: "result", requestId: request.requestId, outcome: "completed", stdout, tests });
  } catch (error) {
    post({ type: "result", requestId: request.requestId, outcome: "error", stdout, exception: exceptionFrom(error) });
  }
}

worker.onmessage = (event: MessageEvent<PythonWorkerRequest>) => {
  if (event.data.type === "initialize") {
    void getPyodide().then(() => post({ type: "ready" })).catch((error: unknown) => {
      post({ type: "loadError", message: exceptionFrom(error).message });
    });
    return;
  }

  void run(event.data);
};

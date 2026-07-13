import { parentPort, workerData } from "node:worker_threads";
import { analyzeTask } from "../analysis/analyze.js";
import type { ContextManifest } from "../types.js";

interface IssueWorkerRequest {
  root: string;
  task: string;
  budget: number;
  historyCount: number;
}

export type IssueWorkerResponse =
  | { ok: true; manifest: ContextManifest }
  | { ok: false; message: string; stack?: string };

if (!parentPort) throw new Error("Issue evaluation worker requires a parent port.");

const request = workerData as IssueWorkerRequest;

try {
  const manifest = await analyzeTask({
    root: request.root,
    task: request.task,
    budget: request.budget,
    historyCount: request.historyCount,
  });
  parentPort.postMessage({ ok: true, manifest } satisfies IssueWorkerResponse);
} catch (error) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  parentPort.postMessage({
    ok: false,
    message: normalized.message,
    ...(normalized.stack ? { stack: normalized.stack } : {}),
  } satisfies IssueWorkerResponse);
}

import { tsImport } from "tsx/esm/api";

// Source-mode workers need an explicit TypeScript import path on Node 20/22.
await tsImport("./issue-worker.ts", import.meta.url);

import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    "issue-worker": "src/evaluation/issue-worker.ts",
  },
  format: ["esm"],
  target: "node20",
  external: ["typescript"],
  clean: true,
  dts: true,
  sourcemap: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});

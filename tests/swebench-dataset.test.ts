import { describe, expect, it } from "vitest";
import { readIssueDataset as readNormalizedIssueDataset } from "../src/evaluation/issue-dataset.js";
import { adaptSweBenchMultilingualRow, readIssueDataset } from "../src/evaluation/swebench-dataset.js";

describe("SWE-bench Multilingual adapter", () => {
  it("preserves the normalized dataset reader facade", () => {
    expect(readIssueDataset).toBe(readNormalizedIssueDataset);
  });

  it("normalizes a supported JS/TS issue without retaining the gold patch", () => {
    const instance = adaptSweBenchMultilingualRow({
      instance_id: "axios__axios-1",
      repo: "axios/axios",
      base_commit: "1234567890abcdef",
      problem_statement: "Fix cancellation behavior.\r\n",
      issue_url: "https://github.com/axios/axios/issues/1",
      pr_url: "https://github.com/axios/axios/pull/2",
      created_at: "2024-01-01",
      patch: `diff --git a/lib/cancel.js b/lib/cancel.js
--- a/lib/cancel.js
+++ b/lib/cancel.js
@@ -5,2 +5,2 @@
-old
+new
 context
`,
    });
    expect(instance).toMatchObject({
      instanceId: "axios__axios-1",
      repo: "axios/axios",
      issueText: "Fix cancellation behavior.",
      language: "javascript-typescript",
      goldRegions: [{ path: "lib/cancel.js", startLine: 5, endLine: 6 }],
      metadata: { excludedPatchFiles: 0 },
    });
    expect(instance).not.toHaveProperty("patch");
    expect(instance?.metadata.patchSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores repositories outside the official JS/TS subset", () => {
    expect(adaptSweBenchMultilingualRow({
      instance_id: "redis__redis-1",
      repo: "redis/redis",
      base_commit: "1234567890abcdef",
      problem_statement: "Fix a bug",
      patch: "diff --git a/a.c b/a.c\n--- a/a.c\n+++ b/a.c\n@@ -1 +1 @@\n-old\n+new",
    })).toBeNull();
  });
});

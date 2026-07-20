import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readIssueDataset } from "../src/evaluation/issue-dataset.js";
import type { IssueBenchmarkInstance } from "../src/evaluation/issue-types.js";

const created: string[] = [];

afterEach(async () => Promise.all(created.splice(0).map((directory) => fs.rm(directory, {
  recursive: true,
  force: true,
}))));

async function writeDataset(instances: unknown[]): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-issue-dataset-"));
  created.push(directory);
  const dataset = path.join(directory, "issues.jsonl");
  await fs.writeFile(dataset, `${instances.map((instance) => JSON.stringify(instance)).join("\n")}\n`);
  return dataset;
}

const pythonInstance: IssueBenchmarkInstance = {
  instanceId: "example__python-1",
  sourceDataset: "fixture/python",
  sourceRevision: "fixture-v1",
  repo: "example/python",
  baseCommit: "a".repeat(40),
  issueText: "Fix request timeout handling",
  language: "python",
  goldRegions: [{ path: "src/client.py", startLine: 4, endLine: 8, kind: "patch-hunk" }],
  metadata: {
    issueUrl: null,
    prUrl: null,
    createdAt: null,
    patchSha256: "0".repeat(64),
    excludedPatchFiles: 0,
  },
};

describe("normalized issue datasets", () => {
  it("reads a valid Python benchmark instance", async () => {
    const dataset = await writeDataset([pythonInstance]);
    await expect(readIssueDataset(dataset)).resolves.toEqual([pythonInstance]);
  });

  it.each([
    ["invalid language", { language: "ruby" }],
    ["unsafe repository slug", { repo: "example/../python" }],
    ["invalid commit", { baseCommit: "not-a-commit" }],
    ["empty issue text", { issueText: "  " }],
    ["empty gold regions", { goldRegions: [] }],
    ["invalid line ranges", { goldRegions: [{ path: "src/client.py", startLine: 8, endLine: 4, kind: "patch-hunk" }] }],
    ["null metadata", { metadata: null }],
    ["a null gold region", { goldRegions: [null] }],
    ["non-hex patch hash", { metadata: { ...pythonInstance.metadata, patchSha256: "g".repeat(64) } }],
    ["negative excluded count", { metadata: { ...pythonInstance.metadata, excludedPatchFiles: -1 } }],
  ])("rejects an instance with %s", async (_description, invalid) => {
    const dataset = await writeDataset([{ ...pythonInstance, ...invalid }]);
    await expect(readIssueDataset(dataset)).rejects.toMatchObject({ code: "INVALID_DATASET" });
  });

  it("rejects duplicate instance IDs", async () => {
    const dataset = await writeDataset([pythonInstance, pythonInstance]);
    await expect(readIssueDataset(dataset)).rejects.toMatchObject({ code: "INVALID_DATASET" });
  });
});

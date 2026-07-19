import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderDoctor, runDoctor } from "../src/doctor.js";

const created: string[] = [];

afterEach(async () => Promise.all(created.splice(0).map((item) => fs.rm(item, {
  recursive: true,
  force: true,
  maxRetries: 5,
  retryDelay: 100,
}))));

describe("doctor", () => {
  it("accepts a supported non-Git project with a warning", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-doctor-ready-"));
    created.push(root);
    await fs.mkdir(path.join(root, "src"));
    await fs.writeFile(path.join(root, "src", "index.ts"), "export const ready = true;\n");

    const report = await runDoctor(root);

    expect(report.ready).toBe(true);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "node", status: "pass" }),
      expect.objectContaining({ id: "directory", status: "pass" }),
      expect.objectContaining({ id: "sources", status: "pass" }),
      expect.objectContaining({ id: "git", status: "warn" }),
    ]));
    expect(report.checks).toContainEqual(expect.objectContaining({
      id: "sources",
      message: "Found 1 supported source files.",
    }));
    expect(renderDoctor(report)).toContain("Ready: yes");
  });

  it("accepts a Python project without requiring a Python runtime check", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-doctor-python-"));
    created.push(root);
    await fs.writeFile(path.join(root, "app.py"), "ready = True\n");

    const report = await runDoctor(root);

    expect(report.ready).toBe(true);
    expect(report.checks.map((check) => check.id)).toEqual(["node", "directory", "sources", "git"]);
    expect(report.checks).toContainEqual(expect.objectContaining({
      id: "sources",
      status: "pass",
      message: "Found 1 supported source files.",
    }));
  });

  it("rejects a directory without supported source files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-doctor-empty-"));
    created.push(root);

    const report = await runDoctor(root);

    expect(report.ready).toBe(false);
    expect(report.checks).toContainEqual(expect.objectContaining({
      id: "sources",
      status: "fail",
      message: "No supported source files were found.",
      recommendation: "Change into a project root containing JavaScript, TypeScript, or Python source files.",
    }));
    expect(renderDoctor(report)).toContain("Ready: no");
  });

  it("reports an unreadable path without throwing", async () => {
    const root = path.join(os.tmpdir(), `contextpack-doctor-missing-${Date.now()}`);

    const report = await runDoctor(root);

    expect(report.ready).toBe(false);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "directory", status: "fail" }),
      expect.objectContaining({ id: "sources", status: "fail" }),
    ]));
  });
});

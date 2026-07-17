import { spawnSync } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { discoverRepository } from "./repository/discover.js";
import { findGitRoot } from "./utils/git.js";

export type DoctorCheckStatus = "pass" | "warn" | "fail";

export interface DoctorCheck {
  id: "node" | "directory" | "sources" | "git";
  status: DoctorCheckStatus;
  message: string;
  recommendation?: string;
}

export interface DoctorReport {
  version: 1;
  ready: boolean;
  root: string;
  checks: DoctorCheck[];
}

const MINIMUM_NODE_MAJOR = 20;

function nodeCheck(): DoctorCheck {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major >= MINIMUM_NODE_MAJOR) {
    return { id: "node", status: "pass", message: `Node.js ${process.version} is supported.` };
  }
  return {
    id: "node",
    status: "fail",
    message: `Node.js ${process.version} is not supported.`,
    recommendation: `Install Node.js ${MINIMUM_NODE_MAJOR} or newer, then reopen the terminal.`,
  };
}

async function directoryCheck(root: string): Promise<DoctorCheck> {
  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) {
      return {
        id: "directory",
        status: "fail",
        message: `The current path is not a directory: ${root}`,
        recommendation: "Run ContextPack from the root of a JavaScript or TypeScript project.",
      };
    }
    await fs.access(root, fsConstants.R_OK | fsConstants.W_OK);
    return { id: "directory", status: "pass", message: `Project directory is readable and writable: ${root}` };
  } catch {
    return {
      id: "directory",
      status: "fail",
      message: `Cannot read and write the project directory: ${root}`,
      recommendation: "Check the directory path and permissions, then run the command again.",
    };
  }
}

async function sourcesCheck(root: string): Promise<DoctorCheck> {
  try {
    const repository = await discoverRepository(root);
    return {
      id: "sources",
      status: "pass",
      message: `Found ${repository.sourceFiles.length} supported JavaScript or TypeScript source files.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "sources",
      status: "fail",
      message,
      recommendation: "Change into the project root containing .js, .jsx, .ts, .tsx, .mjs, .cjs, .mts, or .cts files.",
    };
  }
}

function gitCheck(root: string): DoctorCheck {
  const version = spawnSync("git", ["--version"], { encoding: "utf8", windowsHide: true });
  if (version.status !== 0) {
    return {
      id: "git",
      status: "warn",
      message: "Git is not available; static analysis will still work.",
      recommendation: "Install Git to enable commit-history and co-change signals.",
    };
  }
  if (findGitRoot(root) === null) {
    return {
      id: "git",
      status: "warn",
      message: "The project is not a Git repository; static analysis will still work.",
      recommendation: "Use a Git repository when you want history-aware ranking.",
    };
  }
  return { id: "git", status: "pass", message: "Git history is available." };
}

export async function runDoctor(start: string): Promise<DoctorReport> {
  const root = path.resolve(start);
  const checks = await Promise.all([
    Promise.resolve(nodeCheck()),
    directoryCheck(root),
    sourcesCheck(root),
    Promise.resolve(gitCheck(root)),
  ]);
  return {
    version: 1,
    ready: checks.every((check) => check.status !== "fail"),
    root,
    checks,
  };
}

export function renderDoctor(report: DoctorReport): string {
  const labels: Record<DoctorCheckStatus, string> = { pass: "PASS", warn: "WARN", fail: "FAIL" };
  const lines = ["ContextPack doctor", ""];
  for (const check of report.checks) {
    lines.push(`[${labels[check.status]}] ${check.message}`);
    if (check.recommendation) lines.push(`       Next: ${check.recommendation}`);
  }
  lines.push("", report.ready ? "Ready: yes" : "Ready: no");
  if (report.ready) lines.push('Next: contextpack task "describe your coding task"');
  return `${lines.join("\n")}\n`;
}

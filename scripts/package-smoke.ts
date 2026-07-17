import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath;

function run(command: string, args: string[], cwd: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error([
      `Command failed (${result.status ?? "unknown"}): ${command} ${args.join(" ")}`,
      result.error?.message,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join("\n"));
  }
  return result.stdout.trim();
}

async function main(): Promise<void> {
  if (!npmCli) throw new Error("npm_execpath is unavailable; run this smoke test through npm run test:package.");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "contextpack-package-smoke-"));
  try {
    const packDirectory = path.join(temp, "pack");
    const consumer = path.join(temp, "consumer");
    const fixture = path.join(consumer, "fixture");
    await fs.mkdir(packDirectory, { recursive: true });
    await fs.mkdir(path.join(fixture, "src"), { recursive: true });
    await fs.writeFile(path.join(consumer, "package.json"), JSON.stringify({ private: true }));
    await fs.writeFile(path.join(fixture, "package.json"), JSON.stringify({ name: "package-smoke-fixture", private: true }));
    await fs.writeFile(
      path.join(fixture, "src", "auth.ts"),
      "export function refreshSession() { return 'ready'; }\n",
    );

    run(process.execPath, [npmCli, "run", "prepack"], repositoryRoot);
    const packed = JSON.parse(run(process.execPath, [npmCli, "pack", "--ignore-scripts", "--json", "--pack-destination", packDirectory], repositoryRoot)) as Array<{
      filename: string;
      files: Array<{ path: string }>;
    }>;
    const packageResult = packed[0];
    if (!packageResult || !packageResult.files.some((file) => file.path === "dist/cli.js")) {
      throw new Error("Packed artifact does not contain dist/cli.js.");
    }
    const tarball = path.join(packDirectory, packageResult.filename);
    run(process.execPath, [npmCli, "install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], consumer);

    const installedCli = path.join(consumer, "node_modules", "contextpack", "dist", "cli.js");
    const version = run(process.execPath, [installedCli, "--version"], fixture);
    if (version !== "0.1.0") throw new Error(`Unexpected installed CLI version: ${version}`);
    const binVersion = run(process.execPath, [npmCli, "exec", "--offline", "--", "contextpack", "--version"], consumer);
    if (binVersion !== version) throw new Error(`Installed npm bin returned an unexpected version: ${binVersion}`);

    const doctor = JSON.parse(run(process.execPath, [installedCli, "doctor", "--json"], fixture)) as { ready?: boolean };
    if (doctor.ready !== true) throw new Error("Installed CLI doctor did not mark the fixture as ready.");

    const output = path.join(fixture, ".contextpack", "package-smoke");
    run(process.execPath, [installedCli, "task", "refresh the user session", "--budget", "4000", "--history", "1", "--output", output], fixture);
    await Promise.all([
      fs.access(path.join(output, "context.md")),
      fs.access(path.join(output, "manifest.json")),
    ]);
    process.stdout.write(`Package smoke passed: ${packageResult.filename}\n`);
  } finally {
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

await main();

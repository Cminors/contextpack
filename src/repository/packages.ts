import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import type { PackageInfo, PackageManager } from "../types.js";
import { relativePosix } from "../utils/path.js";

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function detectPackageManager(root: string, fileNames: Set<string>): PackageManager {
  if (fileNames.has("pnpm-lock.yaml")) return "pnpm";
  if (fileNames.has("yarn.lock")) return "yarn";
  if (fileNames.has("bun.lock") || fileNames.has("bun.lockb")) return "bun";
  if (fileNames.has("package-lock.json")) return "npm";
  return "unknown";
}

export async function discoverPackages(root: string): Promise<PackageInfo[]> {
  const packageFiles = await fg(["package.json", "**/package.json"], {
    cwd: root,
    onlyFiles: true,
    unique: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/.next/**"],
  });

  const packages: PackageInfo[] = [];
  for (const packageFile of packageFiles.sort()) {
    try {
      const absolutePath = path.join(root, packageFile);
      const parsed = JSON.parse(await fs.readFile(absolutePath, "utf8")) as PackageJson;
      packages.push({
        directory: relativePosix(root, path.dirname(absolutePath)) || ".",
        name: parsed.name ?? null,
        scripts: parsed.scripts ?? {},
      });
    } catch {
      // Invalid nested package manifests do not prevent discovery of the rest of the repository.
    }
  }

  return packages;
}

export async function detectProjectTypes(root: string, packages: PackageInfo[]): Promise<string[]> {
  const types = new Set<string>();

  for (const packageInfo of packages) {
    try {
      const manifestPath = path.join(root, packageInfo.directory, "package.json");
      const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")) as PackageJson;
      const dependencies = { ...parsed.dependencies, ...parsed.devDependencies };
      if (dependencies.next) types.add("Next.js");
      if (dependencies.react) types.add("React");
      if (dependencies.express) types.add("Express");
      if (dependencies.fastify) types.add("Fastify");
      if (dependencies.vite) types.add("Vite");
      if (dependencies.typescript) types.add("TypeScript");
    } catch {
      // Best-effort metadata only.
    }
  }

  if (types.size === 0) {
    types.add("JavaScript/TypeScript");
  }
  return [...types];
}

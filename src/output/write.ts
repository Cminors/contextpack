import fs from "node:fs/promises";
import path from "node:path";

export async function writeArtifacts(directory: string, artifacts: Record<string, string>): Promise<void> {
  const target = path.resolve(directory);
  await fs.mkdir(target, { recursive: true });
  await Promise.all(Object.entries(artifacts).map(([name, content]) => fs.writeFile(path.join(target, name), content, "utf8")));
}

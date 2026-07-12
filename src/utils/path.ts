import path from "node:path";

export function toPosixPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function relativePosix(root: string, value: string): string {
  return toPosixPath(path.relative(root, value));
}

export function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function commonDirectory(paths: string[]): string {
  if (paths.length === 0) {
    return ".";
  }

  const parts = paths.map((item) => toPosixPath(item).split("/"));
  const first = parts[0] ?? [];
  let end = first.length;

  for (const current of parts.slice(1)) {
    end = Math.min(end, current.length);
    for (let index = 0; index < end; index += 1) {
      if (first[index] !== current[index]) {
        end = index;
        break;
      }
    }
  }

  return first.slice(0, end).join("/") || ".";
}

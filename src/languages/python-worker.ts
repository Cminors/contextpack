import type { SymbolRecord } from "../types.js";

export interface PythonWorkerRequest {
  version: 1;
  root: string;
  files: string[];
}

export interface PythonImportRecord {
  module: string;
  level: number;
}

export interface PythonWorkerFile {
  path: string;
  symbols: SymbolRecord[];
  imports: PythonImportRecord[];
  isTest: boolean;
  isConfig: boolean;
}

export interface PythonWorkerResponse {
  version: 1;
  files: PythonWorkerFile[];
  errors: Array<{ path: string; code: "PYTHON_PARSE_FAILED" | "PYTHON_READ_FAILED"; message: string }>;
}

/** Versioned stdlib-only worker. Keep stdout to one JSON value for robust parsing. */
export const PYTHON_WORKER_SOURCE = String.raw`import ast
import json
import os
import sys

def end_line(node):
    return getattr(node, "end_lineno", getattr(node, "lineno", 1))

def is_test(path):
    p = path.replace("\\\\", "/")
    base = os.path.basename(p).lower()
    return ("/tests/" in "/" + p + "/" or "/test/" in "/" + p + "/" or "/spec/" in "/" + p + "/"
            or base.startswith("test_") or base.endswith("_test.py"))

def is_config(path):
    return os.path.basename(path).lower() == "setup.py"

def has_pytest_structure(tree):
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test_"):
            return True
        if isinstance(node, ast.ClassDef) and node.name.startswith("Test"):
            return True
    return False

def decorated_start(node):
    starts = [node.lineno]
    starts.extend(getattr(item, "lineno", node.lineno) for item in getattr(node, "decorator_list", []))
    return min(starts)

def source_text(lines, start, end):
    return "".join(lines[start - 1:end])

def exported(name):
    return not name.startswith("_")

def names_from_target(node):
    if isinstance(node, ast.Name):
        return [node.id]
    if isinstance(node, (ast.Tuple, ast.List)):
        out = []
        for item in node.elts:
            out.extend(names_from_target(item))
        return out
    return []

def record(name, kind, node, lines, is_exported=True):
    start = decorated_start(node) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) else node.lineno
    end = end_line(node)
    return {"name": name, "kind": kind, "startLine": start, "endLine": end,
            "exported": is_exported, "text": source_text(lines, start, end)}

def symbols_for(tree, lines, path):
    records = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            records.append(record(node.name, "function", node, lines, exported(node.name)))
        elif isinstance(node, ast.ClassDef):
            records.append(record(node.name, "class", node, lines, exported(node.name)))
            for member in node.body:
                if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    records.append(record(node.name + "." + member.name, "method", member, lines, exported(member.name)))
        elif isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                for name in names_from_target(target):
                    records.append(record(name, "variable", node, lines, exported(name)))
    if not records and lines and "".join(lines).strip():
        records.append({"name": os.path.basename(path), "kind": "module", "startLine": 1,
                        "endLine": len(lines), "exported": False, "text": "".join(lines)})
    return records

def imports_for(tree):
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for item in node.names:
                out.append({"module": item.name, "level": 0})
        elif isinstance(node, ast.ImportFrom):
            level = int(node.level or 0)
            if node.module:
                out.append({"module": node.module, "level": level})
            else:
                for item in node.names:
                    out.append({"module": item.name, "level": level})
    return out

def main():
    request = json.load(sys.stdin)
    if request.get("version") != 1 or not isinstance(request.get("root"), str) or not isinstance(request.get("files"), list):
        raise ValueError("unsupported worker protocol")
    root = request["root"]
    real_root = os.path.realpath(root)
    files = sorted(str(item).replace("\\\\", "/") for item in request["files"])
    result = {"version": 1, "files": [], "errors": []}
    for rel in files:
        absolute = os.path.join(root, *rel.split("/"))
        try:
            real_absolute = os.path.realpath(absolute)
            if os.path.commonpath([real_root, real_absolute]) != real_root:
                raise OSError("path escapes repository root")
            with open(absolute, "r", encoding="utf-8") as handle:
                content = handle.read()
        except Exception as exc:
            result["errors"].append({"path": rel, "code": "PYTHON_READ_FAILED", "message": str(exc)})
            continue
        try:
            tree = ast.parse(content, filename=rel)
        except Exception as exc:
            result["errors"].append({"path": rel, "code": "PYTHON_PARSE_FAILED", "message": str(exc)})
            continue
        lines = content.splitlines(True)
        result["files"].append({"path": rel, "symbols": symbols_for(tree, lines, rel),
                                 "imports": imports_for(tree), "isTest": is_test(rel) or has_pytest_structure(tree),
                                 "isConfig": is_config(rel)})
    result["files"].sort(key=lambda item: item["path"])
    result["errors"].sort(key=lambda item: (item["path"], item["code"]))
    print(json.dumps(result, separators=(",", ":")))

if __name__ == "__main__":
    main()
`;

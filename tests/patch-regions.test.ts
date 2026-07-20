import { describe, expect, it } from "vitest";
import { parsePatchRegions } from "../src/evaluation/patch-regions.js";

describe("patch region parsing", () => {
  it("maps old-side source hunks to the base checkout", () => {
    const patch = `diff --git a/src/auth.ts b/src/auth.ts
index 111..222 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,4 +10,5 @@ function login() {
-  return false
+  return true
 }
@@ -30 +31 @@ export const enabled = false
-old
+new
`;
    expect(parsePatchRegions(patch).regions).toEqual([
      { path: "src/auth.ts", startLine: 10, endLine: 13, kind: "patch-hunk" },
      { path: "src/auth.ts", startLine: 30, endLine: 30, kind: "patch-hunk" },
    ]);
  });

  it("anchors insertions and excludes new or unsupported files", () => {
    const patch = `diff --git a/src/value.ts b/src/value.ts
--- a/src/value.ts
+++ b/src/value.ts
@@ -4,0 +5,2 @@
+one
+two
diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1 @@
+new
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
-old
+new
`;
    const result = parsePatchRegions(patch);
    expect(result.regions).toEqual([
      { path: "src/value.ts", startLine: 4, endLine: 4, kind: "patch-hunk" },
    ]);
    expect(result.excludedFiles).toEqual(expect.arrayContaining([
      { path: "new.ts", reason: "new-file" },
      { path: "README.md", reason: "unsupported-file" },
    ]));
  });

  it("uses the old path for renamed files", () => {
    const result = parsePatchRegions(`diff --git a/src/old.ts b/src/new.ts
similarity index 80%
rename from src/old.ts
rename to src/new.ts
--- a/src/old.ts
+++ b/src/new.ts
@@ -2,2 +2,2 @@
 context
-old
+new
`);
    expect(result.regions[0]).toMatchObject({ path: "src/old.ts", startLine: 2, endLine: 3 });
  });

  it("classifies binary files that have no text hunks", () => {
    const result = parsePatchRegions(`diff --git a/src/logo.js b/src/logo.js
index 111..222 100644
Binary files a/src/logo.js and b/src/logo.js differ
--- a/src/logo.js
+++ b/src/logo.js
diff --git a/image.png b/image.png
new file mode 100644
--- /dev/null
+++ b/image.png
`);
    expect(result.excludedFiles).toEqual(expect.arrayContaining([
      { path: "src/logo.js", reason: "no-old-side-hunk" },
      { path: "image.png", reason: "new-file" },
    ]));
  });

  it("filters source hunks by the declared benchmark language", () => {
    const patch = `diff --git a/src/service.py b/src/service.py
--- a/src/service.py
+++ b/src/service.py
@@ -7,2 +7,2 @@
-old
+new
 context
diff --git a/src/service.ts b/src/service.ts
--- a/src/service.ts
+++ b/src/service.ts
@@ -3 +3 @@
-old
+new
`;

    expect(parsePatchRegions(patch, "python")).toMatchObject({
      regions: [{ path: "src/service.py", startLine: 7, endLine: 8 }],
      excludedFiles: [{ path: "src/service.ts", reason: "unsupported-file" }],
    });
    expect(parsePatchRegions(patch)).toMatchObject({
      regions: [{ path: "src/service.ts", startLine: 3, endLine: 3 }],
      excludedFiles: [{ path: "src/service.py", reason: "unsupported-file" }],
    });
  });
});

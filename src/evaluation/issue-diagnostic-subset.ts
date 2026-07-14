import type { IssueFailureAudit } from "./issue-audit.js";
import type { IssueBenchmarkInstance } from "./issue-types.js";

export function selectIssueDiagnosticInstances(
  audit: IssueFailureAudit,
  instances: readonly IssueBenchmarkInstance[],
): IssueBenchmarkInstance[] {
  const instanceIds = new Set(
    audit.entries
      .filter((entry) => entry.category === "file-miss-outside-top-20")
      .map((entry) => entry.instanceId),
  );
  const selected = instances.filter((instance) => instanceIds.has(instance.instanceId));
  const found = new Set(selected.map((instance) => instance.instanceId));
  const missing = [...instanceIds].filter((instanceId) => !found.has(instanceId));
  if (missing.length > 0) {
    throw new Error(`Diagnostic instances missing from dataset: ${missing.join(", ")}`);
  }
  const mismatched = selected.filter((instance) =>
    instance.sourceDataset !== audit.sourceDataset || instance.sourceRevision !== audit.sourceRevision,
  );
  if (mismatched.length > 0) {
    throw new Error(
      `Diagnostic source mismatch: audit=${audit.sourceDataset}@${audit.sourceRevision}; `
      + `instances=${mismatched.map((instance) => `${instance.instanceId}:${instance.sourceDataset}@${instance.sourceRevision}`).join(", ")}`,
    );
  }
  return selected;
}

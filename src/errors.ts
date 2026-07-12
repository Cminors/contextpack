export class ContextPackError extends Error {
  public readonly exitCode: number;
  public readonly code: string;

  public constructor(message: string, exitCode: number, code: string) {
    super(message);
    this.name = "ContextPackError";
    this.exitCode = exitCode;
    this.code = code;
  }
}

export function toContextPackError(error: unknown): ContextPackError {
  if (error instanceof ContextPackError) {
    return error;
  }

  if (typeof error === "object" && error !== null && "code" in error && String(error.code).startsWith("commander.")) {
    const message = error instanceof Error ? error.message : String(error);
    return new ContextPackError(message, 1, "INVALID_CLI_INPUT");
  }

  const message = error instanceof Error ? error.message : String(error);
  return new ContextPackError(message, 3, "ANALYSIS_FAILED");
}

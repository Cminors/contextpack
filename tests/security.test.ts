import { describe, expect, it } from "vitest";
import { containsLikelySecret, isSensitivePath } from "../src/utils/security.js";

describe("secret safeguards", () => {
  it("rejects credential paths and likely secret contents", () => {
    expect(isSensitivePath(".env.local")).toBe(true);
    expect(isSensitivePath("config/private.pem")).toBe(true);
    expect(isSensitivePath("src/auth.ts")).toBe(false);
    expect(containsLikelySecret('api_key = "12345678901234567890"')).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import {
  usernameSchema,
  passwordSchema,
  messageSchema,
  validateFile,
  MAX_FILE_SIZE,
} from "../lib/validation";
describe("input validation", () => {
  it("normalizes usernames and enforces searchable format", () => {
    expect(usernameSchema.parse(" Alice_01 ")).toBe("alice_01");
    for (const bad of [
      "ab",
      "1alice",
      "user-name",
      "пользователь",
      "x".repeat(25),
    ])
      expect(usernameSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects empty and oversized messages", () => {
    expect(messageSchema.parse(" hello ")).toBe("hello");
    for (const bad of [" ", "x".repeat(4001)])
      expect(messageSchema.safeParse(bad).success).toBe(false);
  });
  it("requires strong-enough password length", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("a-long-password-12").success).toBe(true);
  });
  it("rejects executable, SVG, empty, and oversized uploads", () => {
    for (const f of [
      { size: 50, type: "image/svg+xml" },
      { size: MAX_FILE_SIZE + 1, type: "image/png" },
      { size: 0, type: "text/plain" },
      { size: 100, type: "application/x-msdownload" },
    ])
      expect(() => validateFile(f)).toThrow();
    expect(() =>
      validateFile({ size: 100, type: "application/pdf" }),
    ).not.toThrow();
    expect(() =>
      validateFile({ size: 100, type: "application/pdf" }, true),
    ).toThrow();
  });
});

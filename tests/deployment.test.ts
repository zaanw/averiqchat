import { describe, it, expect } from "vitest";
import { pagesEnvironment } from "../scripts/pages-environment.mjs";
describe("Pages configuration", () => {
  it("uses public project configuration without requiring Actions Variables", () => {
    const env = pagesEnvironment({ NODE_ENV: "test" });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toMatch(
      /^https:\/\/.+\.supabase\.co$/,
    );
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toMatch(/^sb_publishable_/);
    expect(env.NEXT_PUBLIC_BASE_PATH).toBe("/averiqchat");
  });
  it("rejects administrative keys before they can reach a browser bundle", () => {
    expect(() =>
      pagesEnvironment({
        NODE_ENV: "test",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_secret_example",
      }),
    ).toThrow(/forbidden/);
    const service = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    expect(() =>
      pagesEnvironment({
        NODE_ENV: "test",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: service,
      }),
    ).toThrow(/forbidden/);
  });
  it("keeps unconfigured UI checks isolated from the live backend", () => {
    const env = pagesEnvironment({
      NODE_ENV: "test",
      SUPABASE_UNCONFIGURED_TEST: "1",
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("");
  });
});

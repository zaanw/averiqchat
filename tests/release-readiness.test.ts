import { describe, it, expect } from "vitest";
import { evaluateReadiness } from "../scripts/release-readiness.mjs";
const head = "a".repeat(40);
function verified() {
  return {
    head,
    clean: true,
    projectRef: "test-project",
    version: "0.1.0-beta.1",
    ci: ["CI", "Deploy GitHub Pages"].map((name) => ({
      name,
      head_sha: head,
      status: "completed",
      conclusion: "success",
    })),
    auth: {
      smtp_host: "smtp.test",
      smtp_user: "test-user",
      smtp_pass: "test-only",
      mailer_autoconfirm: false,
    },
    backups: { backups: [{ id: "test-backup", status: "COMPLETED" }] },
    acceptance: {
      commit: head,
      projectRef: "test-project",
      completed: true,
      failed: 0,
      skipped: 0,
      passed: 6,
      total: 6,
    },
    manual: {
      projectRef: "test-project",
      commit: head,
      checks: {
        emailDelivery: true,
        passwordRecovery: true,
        multiTab: true,
        networkRecovery: true,
        restoreRehearsal: true,
        supportContact: true,
      },
    },
  };
}
describe("public release gate", () => {
  it("requires all readiness conditions", () => {
    expect(evaluateReadiness(verified()).ready).toBe(true);
  });
  it("blocks missing SMTP and backups even with passing CI", () => {
    const data = verified();
    data.auth.smtp_host = "";
    data.backups.backups = [];
    const report = evaluateReadiness(data);
    expect(report.ready).toBe(false);
    expect(report.checks.filter((c) => !c.ready).map((c) => c.id)).toEqual([
      "smtp",
      "backups",
    ]);
  });
  it("rejects skipped, incomplete, failed, or stale integration runs", () => {
    for (const change of [
      { skipped: 1 },
      { failed: 1 },
      { completed: false },
      { commit: "stale" },
      { total: 7 },
      { passed: 0 },
    ]) {
      const data = verified();
      Object.assign(data.acceptance, change);
      expect(evaluateReadiness(data).ready).toBe(false);
    }
  });
  it("rejects CI and manual signoff from a different commit", () => {
    const data = verified();
    data.ci[0].head_sha = "old";
    data.manual.commit = "old";
    expect(evaluateReadiness(data).ready).toBe(false);
  });
  it("blocks uncommitted source and incomplete backups", () => {
    const data = verified();
    data.clean = false;
    data.backups.backups[0].status = "FAILED";
    expect(evaluateReadiness(data).ready).toBe(false);
  });
  it("never accepts disabled email confirmation", () => {
    const data = verified();
    data.auth.mailer_autoconfirm = true;
    expect(evaluateReadiness(data).ready).toBe(false);
  });
});

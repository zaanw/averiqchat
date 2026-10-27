/** Collect facts outside this module; never treat skipped tests or a draft as a release. */
export function evaluateReadiness({
  head,
  clean,
  version,
  projectRef,
  ci,
  auth,
  backups,
  acceptance,
  manual,
}) {
  const checks = [
    {
      id: "working-tree",
      ready: clean === true,
      detail: "All release source must be committed",
    },
    {
      id: "version",
      ready: /^0\.1\.0-beta\.\d+$/.test(version),
      detail: "Version must identify the beta candidate",
    },
    {
      id: "ci",
      ready: ci.some(
        (run) =>
          run.name === "CI" &&
          run.head_sha === head &&
          run.status === "completed" &&
          run.conclusion === "success",
      ),
      detail: "CI must pass for this exact commit",
    },
    {
      id: "deployment",
      ready: ci.some(
        (run) =>
          run.name === "Deploy GitHub Pages" &&
          run.head_sha === head &&
          run.status === "completed" &&
          run.conclusion === "success",
      ),
      detail: "Pages must deploy this exact commit",
    },
    {
      id: "smtp",
      ready: !!auth.smtp_host && !!auth.smtp_user && !!auth.smtp_pass,
      detail: "Custom SMTP credentials must be configured",
    },
    {
      id: "email-confirmation",
      ready: auth.mailer_autoconfirm === false,
      detail: "Email confirmation must remain enabled",
    },
    {
      id: "backups",
      ready:
        Array.isArray(backups.backups) &&
        backups.backups.some((backup) => backup.status === "COMPLETED"),
      detail: "A recoverable database backup must exist",
    },
    {
      id: "integration",
      ready:
        acceptance?.commit === head &&
        acceptance?.projectRef === projectRef &&
        acceptance?.completed === true &&
        acceptance?.failed === 0 &&
        acceptance?.skipped === 0 &&
        acceptance?.passed >= 6 &&
        acceptance?.total === acceptance?.passed,
      detail:
        "All live integration tests must pass without skips for this commit",
    },
  ];
  for (const id of [
    "emailDelivery",
    "passwordRecovery",
    "multiTab",
    "networkRecovery",
    "restoreRehearsal",
    "supportContact",
  ])
    checks.push({
      id,
      ready:
        manual?.commit === head &&
        manual?.projectRef === projectRef &&
        manual?.checks?.[id] === true,
      detail: "Recorded acceptance on this commit is required",
    });
  return {
    ready: checks.every((check) => !!check.ready),
    checks: checks.map((check) => ({ ...check, ready: !!check.ready })),
  };
}

// Administrative setup only. Runs locally, never in a browser or public workflow.
import { readFileSync } from "node:fs";
const config = JSON.parse(
  readFileSync(
    new URL("../config/supabase.public.json", import.meta.url),
    "utf8",
  ),
);
const projectRef = new URL(config.url).hostname.split(".")[0];
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token)
  throw new Error("Add SUPABASE_ACCESS_TOKEN securely in environment settings");
const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};
async function request(method, body) {
  const response = await fetch(endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Supabase Auth configuration: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
if (process.argv.includes("--apply")) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SMTP_FROM;
  if (!key || !from)
    throw new Error(
      "RESEND_API_KEY and SMTP_FROM are required; do not pass credentials as command-line arguments",
    );
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from) ||
    from.toLowerCase().endsWith("@resend.dev")
  )
    throw new Error("SMTP_FROM must use your own verified sender domain");
  await request("PATCH", {
    smtp_host: "smtp.resend.com",
    smtp_port: 465,
    smtp_user: "resend",
    smtp_pass: key,
    smtp_admin_email: from,
    smtp_sender_name: "Averiq Chat",
    mailer_autoconfirm: false,
  });
}
const auth = await request("GET");
console.log(
  JSON.stringify({
    smtpConfigured: !!auth.smtp_host,
    provider:
      auth.smtp_host === "smtp.resend.com"
        ? "Resend"
        : auth.smtp_host
          ? "custom"
          : "none",
    emailConfirmationRequired: auth.mailer_autoconfirm === false,
  }),
);

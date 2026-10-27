/** Next Link applies basePath itself; use this helper only for browser URLs. */
export function appPath(path = "/") {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
  return `${base}/${path.replace(/^\/+|\/+$/g, "")}${path.replace(/^\/+|\/+$/g, "") ? "/" : ""}`;
}

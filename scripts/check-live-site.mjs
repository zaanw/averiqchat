import assert from "node:assert/strict";
const site = "https://zaanw.github.io/averiqchat/";
const response = await fetch(site, {
  signal: AbortSignal.timeout(30000),
  redirect: "follow",
});
assert.equal(response.status, 200, "Pages must serve the app");
const html = await response.text();
assert.match(html, /<title>[^<]*Averiq/, "The app title must be present");
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
  (match) => new URL(match[1], site),
);
assert.ok(
  scripts.length > 0,
  "The static app must include its JavaScript assets",
);
for (const url of scripts) {
  assert.equal(
    url.origin,
    new URL(site).origin,
    "Unexpected external script origin",
  );
  assert.ok(
    url.pathname.startsWith("/averiqchat/"),
    "Asset must respect the repository base path",
  );
  const asset = await fetch(url, {
    method: "HEAD",
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(asset.status, 200, "A required script asset is unavailable");
}
console.log(
  `Live Pages check passed: HTML and ${scripts.length} JavaScript assets available. This is an availability check, not a user messaging test.`,
);

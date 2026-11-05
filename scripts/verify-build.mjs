import { readFile, access } from "node:fs/promises";
import assert from "node:assert/strict";
const root = ".output/chrome-mv3/";
const manifest = JSON.parse(await readFile(root + "manifest.json", "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(
  manifest.host_permissions,
  ["file:///*"],
  "Runtime scripts must not silently add mandatory all-site access",
);
assert.equal(
  manifest.chrome_url_overrides,
  undefined,
  "Markly must not replace Chrome history or new-tab pages",
);
assert.equal(
  manifest.content_scripts,
  undefined,
  "Scripts must be activated by user or registered site permission",
);
assert.deepEqual([...manifest.permissions].sort(), [
  "activeTab",
  "scripting",
  "storage",
]);
for (const file of [
  "background.js",
  "library.html",
  "notice.html",
  "content-scripts/markly.js",
  ...Object.values(manifest.icons),
])
  await access(root + file);
console.log("Build manifest, permissions and packaged entrypoints verified.");

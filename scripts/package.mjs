import { cp, mkdir, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
await import("./verify-build.mjs");
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await mkdir("release", { recursive: true });
// The stable path keeps an unpacked extension's identity stable across updates.
await rm("release/markly", { recursive: true, force: true });
await cp(".output/chrome-mv3", "release/markly", {
  recursive: true,
  force: true,
});
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else files.push(file);
  }
}
await walk("release/markly");
const sums = [];
for (const file of files.sort())
  sums.push(
    createHash("sha256")
      .update(await readFile(file))
      .digest("hex") +
      "  " +
      file,
  );
await writeFile("release/SHA256SUMS.txt", sums.join("\n") + "\n");
execFileSync("python3", [
  "-c",
  'import os,zipfile,sys\nwith zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED) as z:\n for root,dirs,files in os.walk("release/markly"):\n  for name in files:\n   p=os.path.join(root,name);z.write(p,os.path.relpath(p,"release/markly"))',
  `release/markly-${pkg.version}.zip`,
]);
console.log(`Packaged release/markly and release/markly-${pkg.version}.zip`);

import { chromium } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const profile = await mkdtemp(path.join(tmpdir(), "markly-chrome-"));
let context;
try {
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    ignoreDefaultArgs: ["--disable-extensions"],
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--enable-unsafe-extension-debugging"],
    viewport: { width: 1440, height: 1000 },
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const result = await cdp.send("Extensions.loadUnpacked", {
    path: path.resolve(".output/chrome-mv3"),
  });
  console.log("Chrome", context.browser().version(), "extension", result.id);
  const permissions = await context.newPage();
  await permissions.goto("chrome://extensions");
  await permissions.evaluate(async (id) => {
    await chrome.developerPrivate.updateExtensionConfiguration({
      extensionId: id,
      fileAccess: true,
    });
  }, result.id);
  const settings = await context.newPage();
  const fileUrl = new URL("file://" + path.resolve("fixtures/article.html"))
    .href;
  await settings.goto(
    `chrome-extension://${result.id}/library.html?site=${encodeURIComponent(fileUrl)}`,
  );
  await settings.getByRole("button", { name: "允许并启用" }).click();
  await settings.getByRole("button", { name: "关闭自动启用" }).waitFor();
  const page = await context.newPage();
  await page.goto(fileUrl);
  await page.getByRole("button", { name: "页面备注", exact: true }).click();
  await page
    .getByRole("textbox", { name: "备注内容" })
    .fill("Chrome 实际浏览器验收通过");
  await page.getByRole("button", { name: "保存备注" }).click();
  await page.getByTestId("annotation-card").waitFor();
  await page.reload();
  await page.getByTestId("annotation-card").waitFor();
  await page.screenshot({ path: "artifacts/chrome-smoke.png" });
  await writeFile(
    "artifacts/chrome-version.txt",
    context.browser().version() +
      "\nLocal HTML: activate, save, reload and restore passed.\n",
  );
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}

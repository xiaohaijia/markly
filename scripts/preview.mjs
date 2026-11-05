import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const html = await readFile("fixtures/article.html");
const server = createServer((req, res) => {
  if (req.url?.startsWith("/fixtures/article.html")) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(html);
  } else {
    res.writeHead(204);
    res.end();
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(4173, "127.0.0.1", resolve);
});
const profile = await mkdtemp(path.join(tmpdir(), "markly-preview-"));
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  ignoreDefaultArgs: ["--disable-extensions"],
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--enable-unsafe-extension-debugging"],
  viewport: { width: 1440, height: 1000 },
});
const cdp = await context.browser().newBrowserCDPSession();
const { id } = await cdp.send("Extensions.loadUnpacked", {
  path: path.resolve(".output/chrome-mv3"),
});
const permissions = await context.newPage();
await permissions.goto("chrome://extensions");
await permissions.evaluate(
  async (id) =>
    chrome.developerPrivate.addHostPermission(id, "http://127.0.0.1/*"),
  id,
);
await permissions.close();
const url = "http://127.0.0.1:4173/fixtures/article.html";
const settings = await context.newPage();
await settings.goto(
  `chrome-extension://${id}/library.html?site=${encodeURIComponent(url)}`,
);
await settings.getByRole("button", { name: "允许并启用" }).click();
await settings.getByRole("button", { name: "关闭自动启用" }).waitFor();
const page = await context.newPage();
await page.goto(url);
await page.getByRole("complementary", { name: "我的标记" }).waitFor();
async function select(selector) {
  await page.locator(selector).evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
}
async function mark(selector, color, note) {
  await select(selector);
  await page.getByRole("button", { name: color, exact: true }).click();
  await page.getByRole("button", { name: "备注", exact: true }).click();
  await page.getByRole("textbox", { name: "备注内容" }).fill(note);
  await page.getByRole("button", { name: "保存备注" }).click();
  await page
    .getByRole("region", { name: "编辑备注" })
    .waitFor({ state: "hidden" });
}
await mark(
  "#intro strong",
  "黄色",
  "AI Agent 的本质是让模型不再只是“回答”，而是真正“完成任务”。",
);
await mark("#intro a", "珊瑚红", "关键能力之一。");
await mark(
  "#intro span",
  "鼠尾草绿",
  "这是真正区分传统模型的地方。值得深入研究。",
);
await mark("#shift", "鼠尾草绿", "非常认同！这是范式的转变。");
await page.getByRole("button", { name: "矩形", exact: true }).click();
const box = await page.locator("#quote").boundingBox();
await page.mouse.move(box.x + 3, box.y + 3);
await page.mouse.down();
await page.mouse.move(box.x + box.width - 3, box.y + box.height - 3, {
  steps: 10,
});
await page.mouse.up();
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "页面备注", exact: true }).click();
await page
  .getByRole("textbox", { name: "备注内容" })
  .fill("这篇文章可以作为一期视频选题素材，重点讲 Agent 的实际应用案例。");
await page.getByRole("button", { name: "保存备注" }).click();
await page
  .getByRole("region", { name: "编辑备注" })
  .waitFor({ state: "hidden" });
await page.getByRole("button", { name: "文字", exact: true }).click();
await page.mouse.click(775, 160);
await page.getByRole("textbox", { name: "图中文字" }).fill("核心能力！");
await page.getByRole("button", { name: "保存备注" }).click();
await page
  .getByRole("region", { name: "编辑备注" })
  .waitFor({ state: "hidden" });
await page.getByRole("button", { name: "箭头", exact: true }).click();
await page.mouse.move(790, 175);
await page.mouse.down();
await page.mouse.move(748, 200, { steps: 8 });
await page.mouse.up();
await page.keyboard.press("Escape");
await page.evaluate(() => window.scrollTo(0, 0));
await select("#intro span");
await page.getByRole("button", { name: "高亮", exact: true }).waitFor();
await page.screenshot({ path: "artifacts/markly-preview.png" });
await settings.goto(`chrome-extension://${id}/library.html`);
await settings.getByRole("button", { name: "展开标记" }).first().click();
await settings.screenshot({ path: "artifacts/markly-library.png" });
await page.bringToFront();
for (const other of context.pages()) {
  if (other !== page && other !== settings) await other.close();
}
console.log(
  "Markly interactive preview: " +
    url +
    "\nChrome " +
    context.browser().version() +
    " · temporary demo profile",
);
async function close() {
  await context.close().catch(() => {});
  server.close();
  await rm(profile, { recursive: true, force: true });
}
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
context.on("close", () => {
  server.close();
  void rm(profile, { recursive: true, force: true });
});
await new Promise((resolve) => context.once("close", resolve));

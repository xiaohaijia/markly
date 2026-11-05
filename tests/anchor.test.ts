import { describe, it, expect, beforeEach } from "vitest";
import {
  captureText,
  indexText,
  restoreText,
  findPosition,
} from "../lib/anchor";
import { pageKey } from "../lib/model";
beforeEach(() => {
  document.body.innerHTML = "";
});
describe("text anchors", () => {
  it("restores Chinese, emoji and selections across inline nodes after DOM replacement", () => {
    document.body.innerHTML =
      "<p>前文 <strong>中文🧠</strong><a> and text</a> 后文</p>";
    const r = document.createRange();
    r.setStart(document.querySelector("strong")!.firstChild!, 0);
    r.setEnd(document.querySelector("a")!.firstChild!, 9);
    const anchor = captureText(r)!;
    expect(anchor.exact).toBe("中文🧠 and text");
    document.body.innerHTML =
      "<header>新内容</header><p>前文 <span>中文🧠 and text</span> 后文</p>";
    expect(restoreText(anchor)?.toString()).toBe("中文🧠 and text");
  });
  it("refuses ambiguous duplicate matches instead of trusting position", () => {
    document.body.innerHTML = "<p>same same</p>";
    const a = {
      exact: "same",
      prefix: "",
      suffix: "",
      start: 0,
      end: 4,
      path: "p",
      block: "",
      version: 1 as const,
    };
    expect(findPosition(indexText().text, a)).toBeNull();
  });
  it("uses context to distinguish repeated text", () => {
    const a = {
      exact: "repeat",
      prefix: "The unique context: ",
      suffix: " and following text.",
      start: 20,
      end: 26,
      path: "p",
      block: "",
      version: 1 as const,
    };
    expect(
      findPosition(
        "Different context: repeat. The unique context: repeat and following text.",
        a,
      ),
    ).toBe(47);
  });
  it("keeps mapping with collapsed whitespace", () => {
    document.body.innerHTML = "<p>before  <b>word</b>\n after</p>";
    const r = document.createRange();
    r.selectNodeContents(document.querySelector("p")!);
    const a = captureText(r)!;
    expect(a.exact).toBe("before word after");
    expect(restoreText(a)?.toString()).toBe("before  word\n after");
  });
  it("does not index editable fields or plugin text", () => {
    document.body.innerHTML =
      "<p>real</p><textarea>secret</textarea><div contenteditable>editing</div><markly-extension>our UI</markly-extension>";
    expect(indexText().text).toBe("real");
  });
  it("returns unresolved when original text is removed", () => {
    document.body.innerHTML = "<p>original thought</p>";
    const r = document.createRange();
    r.selectNodeContents(document.querySelector("p")!);
    const a = captureText(r)!;
    document.body.innerHTML = "<p>replacement</p>";
    expect(restoreText(a)).toBeNull();
  });
  it("preserves query and hash and local path identity", () => {
    expect(pageKey("https://example.com/a?q=1#part")).toBe(
      "https://example.com/a?q=1#part",
    );
    expect(pageKey("file:///tmp/a.html")).toBe("file:///tmp/a.html");
    expect(() => pageKey("chrome://extensions")).toThrow();
  });
});

it("does not attach identical text to a different virtualized post", () => {
  document.body.innerHTML =
    '<article><a href="https://x.com/test/status/123"><time>today</time></a><p>Repeated post text</p></article>';
  const r = document.createRange();
  r.selectNodeContents(document.querySelector("p")!);
  const a = captureText(r)!;
  expect(a.scope).toBe("https://x.com/test/status/123");
  document.querySelector("a")!.href = "https://x.com/test/status/456";
  expect(restoreText(a)).toBeNull();
  document.querySelector("a")!.href = "https://x.com/test/status/123";
  expect(restoreText(a)?.toString()).toBe("Repeated post text");
});

it("captures and restores across an open shadow root without indexing plugin UI", () => {
  document.body.innerHTML =
    '<main><demo-article id="widget"></demo-article></main>';
  const root = document
    .querySelector("demo-article")!
    .attachShadow({ mode: "open" });
  root.innerHTML = "<p>before <strong>中文🧠</strong> after</p>";
  const range = document.createRange();
  range.selectNodeContents(root.querySelector("strong")!);
  const anchor = captureText(range)!;
  expect(anchor.path).toContain(" >>> ");
  expect(anchor.prefix).toBe("before ");
  root.innerHTML = "<p>before <em>中文🧠</em> after</p>";
  expect(restoreText(anchor)?.toString()).toBe("中文🧠");
});

import {
  openRoots,
  parentElement,
  queryAll,
  queryPath,
  isPluginNode,
} from "./runtime/dom";
import type { TextAnchor } from "./model";
export const HOST = "markly-extension";
export function contentIdentity(element: Element): string | undefined {
  let article: Element | null = element;
  while (article && !article.matches("article"))
    article = parentElement(article);
  const link = article?.querySelector("time")?.closest("a[href]");
  return link instanceof HTMLAnchorElement ? link.href : undefined;
}
export function matchesScope(anchor: TextAnchor, range: Range) {
  const element = range.startContainer.parentElement;
  return (
    !anchor.scope || (!!element && contentIdentity(element) === anchor.scope)
  );
}
export function editable(node: Node | null): boolean {
  for (
    let el = node instanceof Element ? node : node?.parentElement;
    el;
    el = parentElement(el)
  ) {
    if (
      el.matches(
        'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
      )
    )
      return true;
  }
  return false;
}
export function cssPath(el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body && parts.length < 12) {
    if (current.id) {
      parts.unshift("#" + CSS.escape(current.id));
      break;
    }
    const tag = current.tagName.toLowerCase();
    const siblings = Array.from(
      (current.parentNode instanceof ShadowRoot
        ? current.parentNode.children
        : current.parentElement?.children) ?? [],
    ).filter((e) => e.tagName === current!.tagName);
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
    current = current.parentElement;
  }
  const local = parts.join(" > ");
  const root = el.getRootNode();
  return root instanceof ShadowRoot
    ? `${cssPath(root.host)} >>> ${local}`
    : local;
}
export function normalize(text: string) {
  return text.replace(/\s+/g, " ");
}
type Ref = { node: Text; offset: number };
export function indexText(root: Node = document.body) {
  let text = "";
  const refs: Ref[] = [];
  const roots: Node[] =
    root instanceof Document ||
    root instanceof Element ||
    root instanceof ShadowRoot
      ? openRoots(root)
      : [root];
  for (const subtree of roots) {
    const walker = document.createTreeWalker(subtree, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const el = node.parentElement;
        if (
          !el ||
          isPluginNode(el) ||
          editable(el) ||
          el.closest(
            `script,style,noscript,template,${HOST},[hidden],[aria-hidden="true"]`,
          )
        )
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const value = node.textContent ?? "";
      for (let i = 0; i < value.length; i++) {
        const ch = /\s/.test(value[i]!) ? " " : value[i]!;
        if (ch === " " && text.endsWith(" ")) continue;
        text += ch;
        refs.push({ node: node as Text, offset: i });
      }
    }
  }
  return { text, refs };
}
export function captureText(range: Range): TextAnchor | null {
  if (editable(range.startContainer) || editable(range.endContainer))
    return null;
  // Capture only the selected block, not every character on the entire site.
  const common = range.commonAncestorContainer;
  const container = common instanceof Text ? common.parentElement! : common;
  const captureRoot =
    container instanceof Element
      ? (container.closest(
          "p,li,blockquote,h1,h2,h3,h4,td,pre,article,section",
        ) ?? container)
      : container;
  const index = indexText(captureRoot);
  let start = -1,
    end = -1;
  for (let i = 0; i < index.refs.length; i++) {
    const ref = index.refs[i]!;
    if (
      range.isPointInRange(ref.node, ref.offset) &&
      !(ref.node === range.endContainer && ref.offset >= range.endOffset)
    ) {
      if (start < 0) start = i;
      end = i + 1;
    }
  }
  if (start < 0 || end <= start) return null;
  const el = range.startContainer.parentElement;
  const block = el?.closest("p,li,blockquote,h1,h2,h3,h4,td,pre,article") ?? el;
  return {
    exact: index.text.slice(start, end),
    scope: el ? contentIdentity(el) : undefined,
    prefix: index.text.slice(Math.max(0, start - 80), start),
    suffix: index.text.slice(end, end + 80),
    start,
    end,
    path: block ? cssPath(block) : "",
    block: normalize(block?.textContent ?? "").slice(0, 2000),
    version: 1,
  };
}
export function findPosition(text: string, a: TextAnchor): number | null {
  const candidates: number[] = [];
  let at = text.indexOf(a.exact);
  while (at !== -1) {
    candidates.push(at);
    if (candidates.length > 10000) return null;
    at = text.indexOf(a.exact, at + 1);
  }
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0]!;
  const scores = candidates
    .map((pos) => {
      let score = 0;
      const prefix = text.slice(Math.max(0, pos - a.prefix.length), pos);
      const suffix = text.slice(
        pos + a.exact.length,
        pos + a.exact.length + a.suffix.length,
      );
      for (let j = 1; j <= Math.min(prefix.length, a.prefix.length); j++) {
        if (prefix.at(-j) !== a.prefix.at(-j)) break;
        score++;
      }
      for (let j = 0; j < Math.min(suffix.length, a.suffix.length); j++) {
        if (suffix[j] !== a.suffix[j]) break;
        score++;
      }
      return { pos, score };
    })
    .sort((x, y) => y.score - x.score);
  return scores[0]!.score >= 8 && scores[0]!.score > scores[1]!.score + 4
    ? scores[0]!.pos
    : null;
}
export function restoreText(
  a: TextAnchor,
  index?: ReturnType<typeof indexText>,
): Range | null {
  if (a.scope) {
    const articles = queryAll("article").filter(
      (el) => contentIdentity(el) === a.scope,
    );
    if (articles.length !== 1) return null;
    index = indexText(articles[0]!);
  }
  index ??= indexText();
  const pos = findPosition(index.text, a);
  if (pos === null) return null;
  const first = index.refs[pos],
    last = index.refs[pos + a.exact.length - 1];
  if (!first || !last) return null;
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  return range;
}

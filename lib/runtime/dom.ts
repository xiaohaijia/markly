// DOM paths and traversal must cross open shadow boundaries consistently.
export const PLUGIN_HOST = "markly-extension";
export function parentElement(node: Node): Element | null {
  if (node instanceof Element && node.assignedSlot) return node.assignedSlot;
  if (node.parentElement) return node.parentElement;
  const root = node.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}
export function isPluginNode(node: Node | null): boolean {
  for (
    let el = node instanceof Element ? node : node?.parentElement;
    el;
    el = parentElement(el)
  )
    if (el.matches(`${PLUGIN_HOST}[data-markly="true"]`)) return true;
  return false;
}
export function openRoots(
  root: Document | ShadowRoot | Element = document,
): (Document | ShadowRoot | Element)[] {
  const roots: (Document | ShadowRoot | Element)[] = [root];
  if (
    root instanceof Element &&
    root.shadowRoot &&
    root.tagName.toLowerCase() !== PLUGIN_HOST
  )
    roots.push(...openRoots(root.shadowRoot));
  for (const el of root.querySelectorAll("*")) {
    if (el.tagName.toLowerCase() === PLUGIN_HOST) continue;
    if (el.shadowRoot) roots.push(...openRoots(el.shadowRoot));
  }
  return roots;
}
export function queryAll(selector: string): Element[] {
  return openRoots()
    .flatMap((root) => Array.from(root.querySelectorAll(selector)))
    .filter((el) => !isPluginNode(el));
}
export function queryPath(path: string): Element | null {
  let root: Document | ShadowRoot = document;
  const parts = path.split(" >>> ");
  for (let i = 0; i < parts.length; i++) {
    const element = root.querySelector(parts[i]!) as Element | null;
    if (!element) return null;
    if (i === parts.length - 1) return element;
    if (!element.shadowRoot) return null;
    root = element.shadowRoot;
  }
  return null;
}
export function hitElements(x: number, y: number): Element[] {
  const found: Element[] = [];
  const seen = new Set<Element>();
  function visit(root: Document | ShadowRoot) {
    for (const el of root.elementsFromPoint(x, y)) {
      if (seen.has(el) || isPluginNode(el)) continue;
      seen.add(el);
      if (el.shadowRoot) visit(el.shadowRoot);
      found.push(el);
    }
  }
  visit(document);
  return found;
}

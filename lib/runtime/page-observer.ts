import { invalidateContent } from "./content-clock";
import { isPluginNode, openRoots } from "./dom";

type Options = { geometry(): void; content(): void; route(url: string): void };
/** One owner for subscriptions, batching, body replacement and SPA lifecycle. */
export function observePage(options: Options) {
  let frame = 0,
    dirtyText = false,
    disposed = false,
    url = location.href;
  const animations = new Set<Element>();
  const roots = new Map<Document | ShadowRoot, () => void>();
  const cleanup: (() => void)[] = [];
  const resized = new Set<Element>();
  function schedule(text = false) {
    dirtyText ||= text;
    if (!frame && !disposed) frame = requestAnimationFrame(flush);
  }
  function flush() {
    frame = 0;
    if (disposed) return;
    if (url !== location.href) {
      url = location.href;
      options.route(url);
      dirtyText = true;
    }
    if (dirtyText) {
      dirtyText = false;
      invalidateContent();
      options.content();
    }
    options.geometry();
    for (const target of animations)
      if (
        !target.isConnected ||
        !target.getAnimations().some((a) => a.playState === "running")
      )
        animations.delete(target);
    if (animations.size) schedule();
  }
  const onMutations = (records: MutationRecord[]) => {
    const relevant = records.filter((r) => !isPluginNode(r.target));
    if (!relevant.length) return;
    schedule(
      relevant.some(
        (r) =>
          r.type !== "attributes" ||
          ["hidden", "aria-hidden", "href", "src", "srcset"].includes(
            r.attributeName ?? "",
          ),
      ),
    );
    for (const r of relevant)
      for (const n of r.addedNodes)
        if (n instanceof Element && !isPluginNode(n)) discover(n);
  };
  const resize = new ResizeObserver(() => schedule());
  function listen(target: EventTarget, event: string, listener: EventListener) {
    target.addEventListener(event, listener, true);
    return () => target.removeEventListener(event, listener, true);
  }
  const animationChange: EventListener = (e) => {
    if (e.target instanceof Element && !isPluginNode(e.target)) {
      animations.add(e.target);
      schedule();
    }
  };
  function discover(root: Document | ShadowRoot | Element = document) {
    for (const r of openRoots(root)) {
      if (r instanceof Element || roots.has(r)) continue;
      const observer = new MutationObserver(onMutations);
      observer.observe(r, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [
          "class",
          "style",
          "hidden",
          "aria-hidden",
          "href",
          "src",
          "srcset",
          "open",
        ],
      });
      const off = [
        listen(r, "scroll", () => schedule()),
        listen(r, "load", () => schedule()),
      ];
      for (const name of [
        "animationstart",
        "animationend",
        "animationcancel",
        "transitionrun",
        "transitionend",
        "transitioncancel",
      ])
        off.push(listen(r, name, animationChange));
      roots.set(r, () => {
        observer.disconnect();
        off.forEach((fn) => fn());
      });
      schedule(true);
    }
    for (const el of resized)
      if (!el.isConnected) {
        resize.unobserve(el);
        resized.delete(el);
      }
    for (const el of [document.body, document.documentElement])
      if (el && !resized.has(el)) {
        resize.observe(el);
        resized.add(el);
      }
  }
  discover();
  cleanup.push(
    listen(window, "resize", () => schedule()),
    listen(window, "pageshow", () => {
      discover();
      schedule(true);
    }),
    listen(window, "popstate", () => schedule(true)),
    listen(window, "hashchange", () => schedule(true)),
  );
  if (window.visualViewport)
    cleanup.push(
      listen(window.visualViewport, "resize", () => schedule()),
      listen(window.visualViewport, "scroll", () => schedule()),
    );
  cleanup.push(listen(document.fonts, "loadingdone", () => schedule()));
  const routeTimer = setInterval(() => {
    if (location.href !== url) schedule(true);
  }, 200);
  // Discovery is independent of text indexing and never retains detached trees.
  const rootsTimer = setInterval(() => {
    for (const [root, off] of roots)
      if (root instanceof ShadowRoot && !root.host.isConnected) {
        off();
        roots.delete(root);
      }
    discover();
  }, 2000);
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    clearInterval(routeTimer);
    clearInterval(rootsTimer);
    roots.forEach((off) => off());
    roots.clear();
    resize.disconnect();
    resized.clear();
    cleanup.forEach((fn) => fn());
    animations.clear();
  };
}

import { HOST } from "../anchor";

/** Own the extension surface independently of the page's layout and React state. */
export function mountSurface(css: string) {
  // Old extension contexts cannot receive messages after an extension reload.
  // Remove only our marked surface, never use the presence of a tag as a lock.
  document
    .querySelectorAll(`${HOST}[data-markly="true"]`)
    .forEach((el) => el.remove());
  const host = document.createElement(HOST);
  host.dataset.markly = "true";
  host.setAttribute("popover", "manual");
  const shadow = host.attachShadow({ mode: "open" });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host { all: initial !important; display: block !important; position: fixed !important;
      inset: 0 !important; width: 100vw !important; height: 100vh !important;
      margin: 0 !important; padding: 0 !important; border: 0 !important;
      background: transparent !important; overflow: visible !important;
      pointer-events: none !important; transform: none !important; zoom: var(--markly-inverse-zoom, 1) !important;
      visibility: visible !important; opacity: 1 !important; z-index: 2147483647 !important;
      direction: ltr !important; writing-mode: horizontal-tb !important; }
    :host::backdrop { background: transparent !important; pointer-events: none !important; }
    ${css}
  `);
  shadow.adoptedStyleSheets = [sheet];
  const container = document.createElement("div");
  container.style.pointerEvents = "none";
  shadow.append(container);
  let disposed = false;
  function ensure() {
    if (disposed || !document.documentElement) return;
    // A modal makes unrelated DOM inert. Keep the same surface inside it while
    // it is open, and return to the document when it closes, without remounting React.
    const modal = Array.from(
      document.querySelectorAll<HTMLDialogElement>("dialog:modal"),
    ).at(-1);
    const parent =
      modal ?? document.fullscreenElement ?? document.documentElement;
    if (host.parentElement !== parent) parent.append(host);
    let zoom = 1;
    for (let el: Element | null = parent; el; el = el.parentElement)
      zoom *= Number(getComputedStyle(el).zoom) || 1;
    const inverse = String(1 / zoom);
    if (host.style.getPropertyValue("--markly-inverse-zoom") !== inverse)
      host.style.setProperty("--markly-inverse-zoom", inverse);
    if (!host.matches(":popover-open")) host.showPopover();
  }
  ensure();
  const observer = new MutationObserver((records) => {
    if (
      !host.isConnected ||
      records.some(
        (r) =>
          r.type === "attributes" &&
          (r.attributeName === "open" ||
            r.target === document.documentElement ||
            r.target === document.body),
      )
    )
      ensure();
  });
  observer.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open", "style", "class"],
  });
  const onToggle = () => ensure();
  document.addEventListener("toggle", onToggle, true);
  document.addEventListener("fullscreenchange", onToggle);
  return {
    host,
    container,
    shadow,
    ensure,
    dispose() {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("toggle", onToggle, true);
      document.removeEventListener("fullscreenchange", onToggle);
      host.remove();
    },
  };
}

import { browser } from "wxt/browser";
import { createRoot } from "react-dom/client";
import { App } from "../components/App";
import { mountSurface } from "../lib/runtime/surface";
import css from "../components/Markly.module.css?inline";
export default defineContentScript({
  registration: "runtime",
  matches: ["http://*/*", "https://*/*", "file:///*"],
  cssInjectionMode: "manual",
  main(ctx) {
    // CSS ships in this script and is adopted synchronously. A blocked resource
    // request can no longer leave a clickable but unstyled extension behind.
    const surface = mountSurface(css);
    const root = createRoot(surface.container);
    root.render(<App />);
    const probe = (
      message: { marklyEvent?: string },
      _sender: unknown,
      reply: (value: unknown) => void,
    ) => {
      if (message.marklyEvent === "probe" && ctx.isValid) {
        surface.ensure();
        reply({ alive: true });
      }
    };
    browser.runtime.onMessage.addListener(probe);
    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(probe);
      root.unmount();
      surface.dispose();
    });
  },
});

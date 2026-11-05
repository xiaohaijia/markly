import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import s from "./Markly.module.css";
import { useGeometry } from "../lib/runtime/geometry-clock";

function Tip({ anchor }: { anchor: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const revision = useGeometry();
  useLayoutEffect(() => {
    const tip = ref.current!;
    function place() {
      if (!anchor.isConnected || !anchor.getClientRects().length) {
        tip.style.visibility = "hidden";
        return;
      }
      const r = anchor.getBoundingClientRect();
      const { width, height } = tip.getBoundingClientRect();
      const side =
        anchor.closest("nav") || anchor.classList.contains(s.launcher!);
      const left = side
        ? r.left - width - 8 >= 8
          ? r.left - width - 8
          : r.right + 8
        : r.left + (r.width - width) / 2;
      const top = side
        ? r.top + (r.height - height) / 2
        : r.top - height - 8 >= 8
          ? r.top - height - 8
          : r.bottom + 8;
      tip.style.left =
        Math.max(8, Math.min(left, innerWidth - width - 8)) + "px";
      tip.style.top =
        Math.max(8, Math.min(top, innerHeight - height - 8)) + "px";
      tip.style.visibility = "visible";
    }
    place();
    const observer = new ResizeObserver(place);
    observer.observe(tip);
    observer.observe(anchor);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, revision]);
  return (
    <div
      ref={ref}
      role="tooltip"
      className={s.tooltip}
      style={{ width: "max-content" }}
    >
      {anchor.dataset.tip}
    </div>
  );
}
export function TooltipScope({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<HTMLElement | null>(null);
  function show(e: SyntheticEvent) {
    const el =
      e.target instanceof Element
        ? e.target.closest<HTMLElement>("[data-tip]")
        : null;
    if (!el?.dataset.tip) return setTip(null);
    setTip(el);
  }
  return (
    <div
      style={{ display: "contents" }}
      onMouseOver={show}
      onMouseOut={() => setTip(null)}
      onFocus={show}
      onBlur={() => setTip(null)}
      onPointerDown={() => setTip(null)}
    >
      {children}
      {tip && <Tip anchor={tip} />}
    </div>
  );
}

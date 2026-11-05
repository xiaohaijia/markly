const mode = new URLSearchParams(location.search).get("mode");
document.documentElement.classList.add(mode || "plain");
document.body.classList.add(mode || "plain");
if (mode === "event-intercept") {
  document.body.addEventListener("mouseup", (e) =>
    e.stopImmediatePropagation(),
  );
  document.body.addEventListener("pointerup", (e) =>
    e.stopImmediatePropagation(),
  );
}
if (mode === "shadow-dom") {
  const widget = document.createElement("demo-article");
  widget.id = "widget";
  const shadow = widget.attachShadow({ mode: "open" });
  shadow.innerHTML =
    '<article><p id="shadow-target">Text inside an open shadow root remains selectable and annotatable.</p></article>';
  document.querySelector("#shell").prepend(widget);
}

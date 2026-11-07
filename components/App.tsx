import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import {
  captureText,
  editable,
  HOST,
  indexText,
  normalize,
  matchesScope,
  restoreText,
} from "../lib/anchor";
import {
  COLORS,
  newBase,
  pageKey,
  rpc,
  type Annotation,
  type Color,
  type Drawing,
  type PageRecord,
  type Point,
  type TextAnchor,
  type TextAnnotation,
} from "../lib/model";
import { LineTool } from "./LineTool";
import { isLine, LINE_LABELS, type LineKind } from "../lib/lines";
import { InlineText } from "./InlineText";
import { EditorSurface } from "./EditorSurface";
import { NoteMarkers } from "./NoteMarkers";
import { invalidateGeometry } from "../lib/runtime/geometry-clock";
import { observeSelection } from "../lib/runtime/selection";
import { observePage } from "../lib/runtime/page-observer";
import { queryPath, isPluginNode } from "../lib/runtime/dom";
import { visibleClip } from "../lib/geometry";
import { bounds, finishDrawing, resolveDrawing } from "../lib/drawing";
import { DrawingLayer, type Tool } from "./DrawingLayer";
import { TooltipScope } from "./TooltipScope";
import { TextMarks } from "./TextMarks";
import { Icon } from "./Icon";
import s from "./Markly.module.css";
type Edit = { annotation: Annotation; isNew: boolean };
type Change = { before: Annotation | null; after: Annotation | null };
const colorNames = {
  yellow: "黄色",
  coral: "珊瑚红",
  green: "鼠尾草绿",
  blue: "灰蓝",
};
const tools: { id: Tool; label: string }[] = [
  { id: "pointer", label: "浏览 / 选择" },
  { id: "pen", label: "自由画笔" },
  { id: "rect", label: "矩形" },
  { id: "ellipse", label: "椭圆" },
  { id: "arrow", label: "箭头" },
  { id: "text", label: "文字" },
];
function getPage(): PageRecord {
  const now = Date.now();
  return {
    id: pageKey(location.href),
    url: location.href,
    title: document.title,
    createdAt: now,
    updatedAt: now,
  };
}
export function App() {
  const [discard, setDiscard] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [page, setPage] = useState(getPage);
  const pageRef = useRef(page);
  pageRef.current = page;
  const [draftDrawings, setDraftDrawings] = useState<Annotation[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const [active, setActive] = useState(true);
  const [lastLine, setLastLine] = useState<LineKind>("line");
  const [toolsOpen, setToolsOpen] = useState(true);
  const editorClose = useRef<HTMLButtonElement>(null);
  const [panel, setPanel] = useState(false),
    [tool, setTool] = useState<Tool>("pointer"),
    [color, setColor] = useState<Color>("yellow"),
    [ink, setInk] = useState<Color>("coral"),
    [hidden, setHidden] = useState(false),
    [search, setSearch] = useState("");
  const [selection, setSelection] = useState<{
    anchor: TextAnchor;
    x: number;
    y: number;
  } | null>(null);
  const [editor, setEditor] = useState<Edit | null>(null),
    [menu, setMenu] = useState<string | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [relink, setRelink] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState("已保存"),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [retry, setRetry] = useState<(() => Promise<void>) | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [undoStack, setUndo] = useState<Change[]>([]),
    [redoStack, setRedo] = useState<Change[]>([]);
  const [unresolved, setUnresolved] = useState<Set<string>>(new Set());
  const ranges = useRef(new Map<string, Range>());
  const rangeAnchors = useRef(new Map<string, string>());
  useEffect(() => {
    setDiscard(false);
  }, [editor?.annotation.id]);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const p = pageRef.current,
      version = ++generation.current;
    try {
      const items = await rpc<Annotation[]>({ type: "list", page: p });
      if (pageRef.current.id === p.id && version === generation.current)
        setAnnotations(items);
    } catch (e) {
      setError(String(e));
    }
  }, []);
  const toggleTools = useCallback(() => {
    setToolsOpen((v) => !v);
    setPanel(false);
    setTool("pointer");
    setSelected(null);
    setRelink(null);
    setSelection(null);
  }, []);
  useEffect(() => {
    void reload();
    const handler = (message: { marklyEvent?: string }) => {
      if (message.marklyEvent === "changed") void reload();
      if (message.marklyEvent === "toggle") {
        setActive((v) => !v);
        setToolsOpen(true);
        setPanel(false);
        setTool("pointer");
        setSelected(null);
        setSelection(null);
        setRelink(null);
      }
    };
    browser.runtime.onMessage.addListener(handler);
    browser.storage.local
      .get(["color", "ink", "lineKind"])
      .then((v) => {
        if (typeof v.lineKind === "string" && isLine(v.lineKind))
          setLastLine(v.lineKind);
        if (typeof v.color === "string" && v.color in COLORS)
          setColor(v.color as Color);
        if (typeof v.ink === "string" && v.ink in COLORS)
          setInk(v.ink as Color);
      })
      .catch(() => {});
    return () => browser.runtime.onMessage.removeListener(handler);
  }, [reload]);
  useEffect(() => {
    browser.storage.local.set({ color, ink }).catch(() => {});
  }, [color, ink]);
  useEffect(
    () =>
      observePage({
        geometry: invalidateGeometry,
        content: () => setRevision((v) => v + 1),
        route: () => {
          generation.current++;
          const next = getPage();
          setPage(next);
          pageRef.current = next;
          setClearConfirm(false);
          setAnnotations([]);
          setDraftDrawings([]);
          ranges.current.clear();
          rangeAnchors.current.clear();
          setUndo([]);
          setRedo([]);
          setEditor(null);
          setSelection(null);
          setSelected(null);
          setRelink(null);
          setTool("pointer");
          setError("");
          setRetry(null);
          void reload();
        },
      }),
    [reload],
  );
  useEffect(() => {
    const nextRanges = new Map<string, Range>();
    const missing = new Set<string>();
    if (!hidden) {
      let index: ReturnType<typeof indexText> | undefined;
      for (const a of annotations) {
        if (a.kind === "text") {
          const previous = ranges.current.get(a.id);
          const range =
            rangeAnchors.current.get(a.id) === JSON.stringify(a.anchor) &&
            previous?.startContainer.isConnected &&
            previous.endContainer.isConnected &&
            matchesScope(a.anchor, previous) &&
            normalize(previous.toString()) === a.anchor.exact
              ? previous
              : restoreText(
                  a.anchor,
                  a.anchor.scope ? undefined : (index ??= indexText()),
                );
          if (!range) {
            missing.add(a.id);
            continue;
          }
          nextRanges.set(a.id, range);
        } else if (
          (a.kind === "drawing" && resolveDrawing(a.drawing).uncertain) ||
          (a.kind === "page" &&
            a.position &&
            resolveDrawing(a.position).uncertain)
        )
          missing.add(a.id);
      }
    }

    ranges.current = nextRanges;
    rangeAnchors.current = new Map(
      annotations
        .filter((a) => a.kind === "text")
        .map((a) => [a.id, JSON.stringify(a.anchor)]),
    );
    setUnresolved(missing);
  }, [annotations, hidden, revision]);
  useEffect(() => {
    if (!active || tool !== "pointer") return;
    return observeSelection(setSelection);
  }, [tool, active]);
  function perform(change: Change, record = true, opId = crypto.randomUUID()) {
    const targetPage = pageRef.current;
    const task = saveQueue.current
      .catch(() => {})
      .then(() => persist(change, record, opId, targetPage));
    saveQueue.current = task;
    return task;
  }
  async function persist(
    change: Change,
    record: boolean,
    opId: string,
    p: PageRecord,
  ) {
    setPending(true);
    setStatus("保存中…");
    setError("");
    try {
      if (change.after)
        await rpc({
          type: "save",
          page: p,
          annotation: change.after,
          expectedUpdatedAt: change.before?.updatedAt ?? null,
          opId,
        });
      else if (change.before)
        await rpc({
          type: "delete",
          pageId: p.id,
          id: change.before.id,
          expectedUpdatedAt: change.before.updatedAt,
          opId,
        });
      if (p.id === pageRef.current.id) {
        await reload();
        if (change.after)
          setDraftDrawings((items) =>
            items.filter((a) => a.id !== change.after!.id),
          );
        setStatus("已保存");
        setRetry(null);
        if (record) {
          setUndo((v) => [...v, change].slice(-50));
          setRedo([]);
        }
      }
      return true;
    } catch (e) {
      if (p.id !== pageRef.current.id) return false;
      setError(e instanceof Error ? e.message : "保存失败");
      setStatus("保存失败");
      setRetry(() => async () => {
        const ok = await persist(change, record, opId, p);
        if (ok && change.after && p.id === pageRef.current.id) {
          const saved = change.after;
          setEditor((v) => {
            if (!v || v.annotation.id !== saved.id) return v;
            const unchanged =
              v.annotation.note === saved.note &&
              JSON.stringify(
                v.annotation.kind === "drawing" ? v.annotation.drawing : null,
              ) ===
                JSON.stringify(saved.kind === "drawing" ? saved.drawing : null);
            return unchanged
              ? null
              : {
                  ...v,
                  isNew: false,
                  annotation: { ...v.annotation, updatedAt: saved.updatedAt },
                };
          });
        }
      });
      return false;
    } finally {
      setPending(false);
    }
  }
  async function clearPage(
    opId = crypto.randomUUID(),
    target = pageRef.current,
  ) {
    setPending(true);
    setError("");
    try {
      await saveQueue.current;
      await rpc({ type: "clear-page", pageId: target.id, opId });
      if (pageRef.current.id !== target.id) return;
      await reload();
      setDraftDrawings([]);
      setUndo([]);
      setRedo([]);
      setSelected(null);
      setEditor(null);
      setClearConfirm(false);
      setRetry(null);
      setStatus("已清空当前页");
    } catch (e) {
      setError(e instanceof Error ? e.message : "清空失败");
      setRetry(() => async () => {
        await clearPage(opId, target);
      });
    } finally {
      setPending(false);
    }
  }
  async function save(a: Annotation, isNew = false) {
    const current = annotationsRef.current.find((v) => v.id === a.id);
    if (!isNew && (!current || current.updatedAt !== a.updatedAt)) {
      setError("其他标签页已修改此标记，请重新打开编辑或另存一条");
      setStatus("保存失败");
      return false;
    }
    return perform({
      before: isNew
        ? null
        : (annotationsRef.current.find((v) => v.id === a.id) ?? null),
      after: { ...a, updatedAt: Date.now() },
    });
  }
  async function undo() {
    const item = undoStack.at(-1);
    if (
      item &&
      (await perform({ before: item.after, after: item.before }, false))
    ) {
      setUndo((v) => v.slice(0, -1));
      setRedo((v) => [...v, item]);
    }
  }
  async function redo() {
    const item = redoStack.at(-1);
    if (item && (await perform(item, false))) {
      setRedo((v) => v.slice(0, -1));
      setUndo((v) => [...v, item]);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === "Escape") {
        if (clearConfirm && pending) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (
          editor?.annotation.kind === "drawing" &&
          editor.annotation.drawing.tool === "text"
        )
          return;
        if (editor) {
          e.preventDefault();
          e.stopPropagation();
          if (!pending) {
            if (discard) setDiscard(false);
            else editorClose.current?.click();
          }
          return;
        }
        if (tool !== "pointer" || selected || relink || editor || selection) {
          e.preventDefault();
          e.stopPropagation();
        }
        setTool("pointer");
        setSelection(null);
        setSelected(null);
        setRelink(null);
        setDiscard(false);
        setClearConfirm(false);
        return;
      }
      if (pending || clearConfirm || editable(e.composedPath()[0] as Node))
        return;
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "z" &&
        (tool !== "pointer" || selected)
      ) {
        e.preventDefault();
        if (e.shiftKey) void redo();
        else void undo();
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        const a = annotations.find((a) => a.id === selected);
        if (a) void perform({ before: a, after: null });
        setSelected(null);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  });
  function mark(style: TextAnnotation["style"], note = false) {
    if (!selection) return;
    if (note && editor) {
      setDiscard(true);
      return;
    }
    const existing = relink ? annotations.find((a) => a.id === relink) : null;
    const a: TextAnnotation =
      existing?.kind === "text"
        ? { ...existing, anchor: selection.anchor }
        : {
            ...newBase(page.id, color),
            kind: "text",
            style,
            anchor: selection.anchor,
          };
    if (note) {
      setEditor({ annotation: a, isNew: !existing });
    } else void save(a, !existing);
    setSelection(null);
    setRelink(null);
    window.getSelection()?.removeAllRanges();
  }
  function edit(a: Annotation) {
    if (editor) {
      if (editor.annotation.id !== a.id) setDiscard(true);
      return;
    }
    setEditor({ annotation: structuredClone(a), isNew: false });
    setMenu(null);
  }
  function jump(a: Annotation) {
    setHidden(false);
    if (a.kind === "text") {
      const range = restoreText(a.anchor);
      if (range) {
        range.startContainer.parentElement?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        setSelected(null);
      } else setError("原文已变化，请选择原文后重新关联。");
    } else if (a.kind === "drawing") {
      setTool("pointer");
      setSelected(a.id);
      if (a.drawing.element) {
        try {
          const element = queryPath(a.drawing.element.path);
          const rect = element?.getBoundingClientRect();
          if (rect && (rect.top < 0 || rect.bottom > innerHeight))
            element?.scrollIntoView({ behavior: "instant", block: "center" });
        } catch {}
      } else
        window.scrollTo({
          top: a.drawing.points[0]![1] - innerHeight / 3,
          behavior: "smooth",
        });
    } else {
      if (a.position) {
        const resolved = resolveDrawing(a.position);
        const point = resolved.points[0];
        if (a.position.element)
          queryPath(a.position.element.path)?.scrollIntoView({
            block: "center",
            behavior: "instant",
          });
        else if (point)
          window.scrollBy({
            top: point[1] - innerHeight / 2,
            behavior: "instant",
          });
      }
      edit(a);
    }
  }
  useEffect(() => {
    if (!annotations.length) return;
    browser.storage.local
      .get("jump")
      .then(async (result) => {
        const pendingJump = result.jump as
          { id: string; pageId: string; at: number } | undefined;
        if (
          pendingJump &&
          pendingJump.pageId === page.id &&
          Date.now() - pendingJump.at < 300000
        ) {
          const a = annotations.find((a) => a.id === pendingJump.id);
          if (a) {
            await browser.storage.local.remove("jump");
            jump(a);
          }
        }
      })
      .catch(() => {});
  }, [annotations, page.id]);
  function addDrawing(drawing: Drawing) {
    const annotation: Annotation = {
      ...newBase(page.id, ink),
      kind: "drawing",
      drawing,
    };
    setDraftDrawings((items) => [...items, annotation]);
    void save(annotation, true);
  }
  function addText(point: Point, el: Element | null) {
    if (editor) {
      setDiscard(true);
      return;
    }
    setEditor({
      annotation: {
        ...newBase(page.id, ink),
        kind: "drawing",
        drawing: {
          ...finishDrawing("text", [point], el, ""),
          textWidth: Math.max(40, Math.min(280, innerWidth - point[0] - 12)),
        },
      },
      isNew: true,
    });
    setTool("pointer");
  }
  function addPageNote(point?: Point, el: Element | null = null) {
    if (editor) {
      setDiscard(true);
      return;
    }
    setTool("pointer");
    setEditor({
      annotation: {
        ...newBase(page.id, "yellow"),
        kind: "page",
        position: point ? finishDrawing("text", [point], el) : undefined,
      },
      isNew: true,
    });
  }
  const visible = annotations.filter((a) =>
    [
      a.note,
      a.kind === "text"
        ? a.anchor.exact
        : a.kind === "drawing"
          ? (a.drawing.text ?? "")
          : "页面备注",
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const swatches = (value: Color, onChange: (c: Color) => void) => (
    <div className={s.colors}>
      {(Object.keys(COLORS) as Color[]).map((c) => (
        <button
          key={c}
          className={s.swatch}
          style={{ background: COLORS[c] }}
          aria-label={colorNames[c]}
          aria-pressed={value === c}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
  if (!active) return null;
  return (
    <TooltipScope>
      <div
        className={s.root}
        data-testid="markly-app"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key !== "Escape" && editable(e.target as Node))
            e.stopPropagation();
        }}
      >
        <TextMarks
          annotations={annotations}
          ranges={ranges.current}
          hidden={hidden}
        />
        <DrawingLayer
          key={page.id + tool}
          annotations={[
            ...annotations.filter(
              (a) =>
                !(
                  editor?.annotation.kind === "drawing" &&
                  editor.annotation.drawing.tool === "text" &&
                  editor.annotation.id === a.id
                ),
            ),
            ...draftDrawings.filter(
              (d) => !annotations.some((a) => a.id === d.id),
            ),
          ]}
          tool={tool}
          color={ink}
          hidden={hidden}
          selected={selected}
          onSelect={setSelected}
          onCreate={addDrawing}
          onUpdate={(a) => void save(a)}
          onText={addText}
          onNote={addPageNote}
          onEdit={edit}
        />
        <NoteMarkers
          annotations={annotations}
          ranges={ranges.current}
          hidden={hidden}
          suppressPreview={!!editor}
          tool={tool}
          onEdit={edit}
        />
        <button
          className={`${s.launcher} ${panel ? s.toolsShift : ""}`}
          data-tip={toolsOpen ? "收起工具栏" : "展开工具栏"}
          aria-label={toolsOpen ? "收起工具栏" : "展开工具栏"}
          aria-expanded={toolsOpen}
          onClick={toggleTools}
        >
          <Icon name="pen" size={24} />
        </button>
        {toolsOpen && (
          <nav
            className={`${s.tools} ${panel ? s.toolsShift : ""}`}
            aria-label="批注工具"
          >
            {tools.map((t) => (
              <button
                key={t.id}
                data-tip={t.label}
                aria-label={t.label}
                aria-pressed={tool === t.id}
                className={tool === t.id ? s.active : ""}
                onClick={() => {
                  setTool(t.id);
                  setHidden(false);
                  setSelection(null);
                }}
              >
                <Icon name={t.id} />
              </button>
            ))}
            <LineTool
              tool={tool}
              last={lastLine}
              onChoose={(kind) => {
                setLastLine(kind);
                setTool(kind);
                setHidden(false);
                setSelection(null);
                void browser.storage.local
                  .set({ lineKind: kind })
                  .catch(() => {});
              }}
            />
            <button
              data-tip="页面备注"
              aria-label="页面备注"
              disabled={!!editor}
              className={tool === "note" ? s.active : ""}
              aria-pressed={tool === "note"}
              onClick={() => {
                setTool(tool === "note" ? "pointer" : "note");
                setHidden(false);
                setSelection(null);
              }}
            >
              <Icon name="note" />
            </button>
            <button
              aria-label="清空当前页批注"
              data-tip="清空当前页批注"
              disabled={pending || !!editor || !annotations.length}
              onClick={() => {
                setTool("pointer");
                setClearConfirm(true);
              }}
            >
              <Icon name="delete" />
            </button>
            <hr />
            <button
              data-tip={hidden ? "显示标记" : "隐藏标记"}
              aria-label={hidden ? "显示标记" : "隐藏标记"}
              onClick={() => {
                setHidden((v) => !v);
                setTool("pointer");
              }}
            >
              <Icon name={hidden ? "hidden" : "eye"} />
            </button>
            <button
              data-tip="撤销"
              aria-label="撤销"
              disabled={!undoStack.length || pending}
              onClick={() => void undo()}
            >
              <Icon name="undo" size={18} />
            </button>
            <button
              data-tip="重做"
              aria-label="重做"
              disabled={!redoStack.length || pending}
              onClick={() => void redo()}
            >
              <Icon name="redo" size={18} />
            </button>
            <button
              aria-label="显示 / 收起批注面板"
              data-tip="本页批注列表"
              aria-expanded={panel}
              onClick={() => setPanel(!panel)}
            >
              <Icon name="panel" />
            </button>
          </nav>
        )}
        {selection && (
          <div
            className={s.selection}
            style={{ left: selection.x, top: selection.y }}
            onPointerDown={(e) => e.preventDefault()}
          >
            {swatches(color, setColor)}
            <span className={s.divider} />
            {relink ? (
              <button onClick={() => mark("highlight")}>关联到此处</button>
            ) : (
              <>
                <button disabled={pending} onClick={() => mark("highlight")}>
                  高亮
                </button>
                <button disabled={pending} onClick={() => mark("underline")}>
                  下划线
                </button>
                <button disabled={pending} onClick={() => mark("strike")}>
                  删除线
                </button>
                <button onClick={() => mark("highlight", true)}>备注</button>
              </>
            )}
          </div>
        )}
        {panel && (
          <aside className={s.panel} aria-label="我的标记">
            <header className={s.panelHeader}>
              <h2 className={s.panelCaption}>当前网页</h2>
              <button
                data-tip="打开全部标记与站点设置"
                aria-label="打开全部标记与站点设置"
                onClick={() => void rpc({ type: "history" })}
              >
                <Icon name="more" />
              </button>
              <button
                data-tip="收起面板"
                aria-label="收起面板"
                onClick={() => setPanel(false)}
              >
                <Icon name="close" size={16} />
              </button>
            </header>
            <div className={s.pageInfo}>
              <h2>{page.title || "未命名网页"}</h2>
              <p className={s.url} data-tip={page.url}>
                {new URL(page.url).host || "本地文件"}
              </p>
            </div>
            <label className={s.search}>
              <Icon name="search" size={16} />
              <input
                aria-label="搜索当前页标记"
                placeholder="搜索当前页的标记…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className={s.indexHeading}>
              <span>{search ? "搜索结果" : "本页批注"}</span>
              <span>{visible.length} 条</span>
            </div>
            <div className={s.list}>
              {visible.length === 0 ? (
                <div className={s.empty}>
                  <Icon name={search ? "search" : "book"} size={32} />
                  <strong>
                    {search ? "没有找到相关标记" : "给网页留一点想法"}
                  </strong>
                  <p>
                    {search
                      ? "试试其他关键词。"
                      : "选中文字划重点，或用画笔圈出灵感。"}
                    <br />
                    {!search && "你的标记会自动保存在这里。"}
                  </p>
                </div>
              ) : (
                visible.map((a) => (
                  <article
                    key={a.id}
                    className={s.card}
                    data-testid="annotation-card"
                    onClick={() => jump(a)}
                  >
                    {a.kind === "text" ? (
                      <span
                        className={s.dot}
                        style={{ background: COLORS[a.color] }}
                      />
                    ) : (
                      <span
                        style={{
                          color: a.kind === "drawing" ? "#708970" : "#C2924C",
                        }}
                      >
                        <Icon
                          name={a.kind === "page" ? "page" : a.drawing.tool}
                          size={19}
                        />
                      </span>
                    )}
                    <div className={s.cardBody}>
                      <p className={s.cardTitle}>
                        {a.kind === "text"
                          ? a.anchor.exact
                          : a.kind === "page"
                            ? a.note || "页面备注"
                            : a.drawing.tool === "text"
                              ? a.drawing.text
                              : {
                                  pen: "自由画笔",
                                  rect: "矩形标注",
                                  ellipse: "圈选标注",
                                  arrow: "箭头标注",
                                  line: "横线",
                                  wave: "波浪线",
                                  double: "双横线",
                                }[a.drawing.tool]}
                      </p>
                      {a.note && a.kind !== "page" && (
                        <p className={s.cardNote}>{a.note}</p>
                      )}
                      {unresolved.has(a.id) && (
                        <p className={s.warning}>
                          {a.kind === "text" ? "原文待定位" : "位置待确认"}
                        </p>
                      )}
                      <p className={s.cardTime}>
                        {a.kind === "page" && "页面备注 · "}
                        {new Date(a.createdAt).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      {menu === a.id && (
                        <div
                          className={s.menu}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button onClick={() => edit(a)}>编辑备注</button>
                          {a.kind === "text" && (
                            <button
                              onClick={() => {
                                setRelink(a.id);
                                setMenu(null);
                              }}
                            >
                              重新关联
                            </button>
                          )}
                          <button
                            className={s.danger}
                            disabled={pending}
                            onClick={() => {
                              void perform({ before: a, after: null });
                              setMenu(null);
                            }}
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      className={s.more}
                      aria-label="标记操作"
                      data-tip="标记操作"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenu(menu === a.id ? null : a.id);
                      }}
                    >
                      <Icon name="more" size={18} />
                    </button>
                  </article>
                ))
              )}
            </div>
            <footer className={s.footer}>
              <div
                className={`${s.status} ${error ? s.error : ""}`}
                aria-live="polite"
              >
                <Icon name={error ? "close" : "check"} size={12} />
                {error || status}
                {retry && (
                  <button disabled={pending} onClick={() => void retry()}>
                    重试
                  </button>
                )}
              </div>
            </footer>
          </aside>
        )}
        {clearConfirm && <div className={s.clearBackdrop} />}
        {clearConfirm && (
          <section
            className={s.editor}
            data-panel={panel}
            role="dialog"
            style={{ zIndex: 31 }}
            aria-modal="true"
            onKeyDown={(e) => {
              if (e.key !== "Tab") return;
              const buttons = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              );
              const current = buttons.indexOf(
                e.currentTarget.getRootNode() instanceof ShadowRoot
                  ? ((e.currentTarget.getRootNode() as ShadowRoot)
                      .activeElement as HTMLButtonElement)
                  : (document.activeElement as HTMLButtonElement),
              );
              e.preventDefault();
              buttons[
                (current + (e.shiftKey ? -1 : 1) + buttons.length) %
                  buttons.length
              ]?.focus();
            }}
            aria-label="清空当前页批注"
          >
            <div className={s.editorHead}>清空当前页批注</div>
            <p>
              删除当前网页的全部 {annotations.length}{" "}
              条批注？其他网页不受影响，此操作无法撤销。
            </p>
            {error && <p className={s.error}>{error}</p>}
            <div className={s.editorActions}>
              <button
                autoFocus
                disabled={pending}
                onClick={() => setClearConfirm(false)}
              >
                取消
              </button>
              <button
                className={s.primary}
                disabled={pending}
                onClick={() => void clearPage()}
              >
                {pending ? "删除中…" : "确认清空"}
              </button>
            </div>
          </section>
        )}
        {!panel && error && !editor && !clearConfirm && (
          <div className={s.modeHint} role="alert">
            {error}
            {retry && (
              <button disabled={pending} onClick={() => void retry()}>
                重试
              </button>
            )}
          </div>
        )}
        {editor?.annotation.kind === "drawing" &&
          editor.annotation.drawing.tool === "text" && (
            <InlineText
              key={editor.annotation.id}
              annotation={editor.annotation}
              isNew={editor.isNew}
              pending={pending}
              error={error}
              onChange={(text, textWidth) =>
                setEditor((v) =>
                  v?.annotation.kind === "drawing"
                    ? {
                        ...v,
                        annotation: {
                          ...v.annotation,
                          drawing: { ...v.annotation.drawing, text, textWidth },
                        },
                      }
                    : v,
                )
              }
              onSave={async () => {
                const current = editor;
                const ok = await save(current.annotation, current.isNew);
                if (ok)
                  setEditor((v) =>
                    v?.annotation.id === current.annotation.id ? null : v,
                  );
                return ok;
              }}
              onCancel={() => {
                setEditor(null);
                setError("");
              }}
              onCopy={async () => {
                const current = editor;
                const copy = {
                  ...current.annotation,
                  id: crypto.randomUUID(),
                  createdAt: Date.now(),
                };
                if (await save(copy, true))
                  setEditor((v) =>
                    v?.annotation.id === current.annotation.id ? null : v,
                  );
              }}
              onRetry={retry ?? undefined}
            />
          )}
        {editor &&
          !(
            editor.annotation.kind === "drawing" &&
            editor.annotation.drawing.tool === "text"
          ) && (
            <EditorSurface
              annotation={editor.annotation}
              draft={editor.isNew}
              panel={panel}
            >
              <div className={s.editorHead}>
                <span className={s.noteLabel}>
                  <Icon name="note" size={14} />
                  {editor.isNew ? "写备注" : "编辑备注"}
                </span>
                <button
                  ref={editorClose}
                  disabled={pending}
                  aria-label="关闭编辑"
                  data-tip="关闭编辑"
                  onClick={() => {
                    const original = annotations.find(
                      (a) => a.id === editor.annotation.id,
                    );
                    const dirty = original
                      ? JSON.stringify(original) !==
                        JSON.stringify(editor.annotation)
                      : !!editor.annotation.note.trim();
                    if (!dirty && !error) setEditor(null);
                    else setDiscard(true);
                  }}
                >
                  <Icon name="close" size={15} />
                </button>
              </div>
              {editor.annotation.kind === "text" && (
                <p className={s.editorQuote}>
                  {editor.annotation.anchor.exact}
                </p>
              )}
              <textarea
                autoFocus
                readOnly={pending}
                aria-label="备注内容"
                rows={2}
                placeholder="在这里留个想法…"
                value={editor.annotation.note}
                onChange={(e) =>
                  setEditor((v) =>
                    v
                      ? {
                          ...v,
                          annotation: { ...v.annotation, note: e.target.value },
                        }
                      : v,
                  )
                }
              />
              {discard && (
                <div className={s.discard} role="alert">
                  <p>放弃尚未保存的编辑？</p>
                  <button onClick={() => setDiscard(false)}>继续编辑</button>
                  <button
                    onClick={() => {
                      setEditor(null);
                      setDiscard(false);
                    }}
                  >
                    放弃编辑
                  </button>
                </div>
              )}
              {error && <p className={s.error}>{error}</p>}
              <div className={s.editorActions}>
                {retry && (
                  <button disabled={pending} onClick={() => void retry()}>
                    重试保存
                  </button>
                )}
                {error.includes("其他标签页") && (
                  <button
                    onClick={async () => {
                      const copy = {
                        ...editor.annotation,
                        id: crypto.randomUUID(),
                        createdAt: Date.now(),
                      };
                      if (await save(copy, true)) setEditor(null);
                    }}
                  >
                    另存一条
                  </button>
                )}
                <button
                  className={s.primary}
                  disabled={
                    pending ||
                    !!retry ||
                    (!editor.annotation.note.trim() &&
                      editor.annotation.kind === "page") ||
                    (editor.annotation.kind === "drawing" &&
                      editor.annotation.drawing.tool === "text" &&
                      !editor.annotation.drawing.text?.trim())
                  }
                  onClick={async () => {
                    const current = editor;
                    if (await save(current.annotation, current.isNew))
                      setEditor(null);
                  }}
                >
                  <Icon name="check" size={15} />
                  {pending
                    ? "保存中…"
                    : editor.annotation.kind === "drawing" &&
                        editor.annotation.drawing.tool === "text"
                      ? "保存文字"
                      : "保存备注"}
                </button>
              </div>
            </EditorSurface>
          )}
        {(tool !== "pointer" || relink || selected) && (
          <div className={s.modeHint}>
            {relink
              ? "选中新的原文，再点击“关联到此处”"
              : selected
                ? "拖动选中的图形，Delete 删除"
                : `${tool === "note" ? "点击网页放置备注" : isLine(tool) ? LINE_LABELS[tool] : tools.find((t) => t.id === tool)?.label}`}
            {selected && (
              <button
                onClick={() => {
                  const a = annotations.find((a) => a.id === selected);
                  if (a) edit(a);
                }}
              >
                编辑
              </button>
            )}
            {selected && (
              <button
                disabled={pending}
                onClick={() => {
                  const a = annotations.find((a) => a.id === selected);
                  if (a) void perform({ before: a, after: null });
                  setSelected(null);
                }}
              >
                删除
              </button>
            )}
            {tool !== "pointer" && tool !== "note" && swatches(ink, setInk)}
            <button
              aria-label="退出当前工具"
              onClick={() => {
                setTool("pointer");
                setRelink(null);
                setSelected(null);
              }}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
      </div>
    </TooltipScope>
  );
}

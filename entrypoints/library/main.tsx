import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";
import { COLORS, rpc, type Annotation, type Backup } from "../../lib/model";
import { TooltipScope } from "../../components/TooltipScope";
import { Icon } from "../../components/Icon";
import ui from "./Archive.module.css";
import s from "../../components/Markly.module.css";
function excerpt(a: Annotation) {
  if (a.kind === "text") return a.anchor.exact;
  if (a.kind === "page") return a.note || "页面备注";
  return (
    a.drawing.text ||
    {
      pen: "自由画笔",
      rect: "矩形标注",
      ellipse: "圈选标注",
      arrow: "箭头标注",
      line: "横线",
      wave: "波浪线",
      double: "双横线",
      text: "文字标注",
    }[a.drawing.tool]
  );
}
function month(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
  });
}
function History() {
  const [deleteTarget, setDeleteTarget] = useState<Annotation | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [data, setData] = useState<Backup | null>(null),
    [search, setSearch] = useState(""),
    [message, setMessage] = useState(""),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState<string | null>(null),
    [origins, setOrigins] = useState<string[]>([]);
  const site = new URLSearchParams(location.search).get("site");
  let origin: string | null = null;
  try {
    if (site) {
      const u = new URL(site);
      origin =
        u.protocol === "file:"
          ? "file:///*"
          : ["http:", "https:"].includes(u.protocol)
            ? u.origin + "/*"
            : null;
    }
  } catch {}
  async function reload() {
    try {
      setData(await rpc<Backup>({ type: "all" }));
      const scripts = await browser.scripting.getRegisteredContentScripts();
      const list = scripts.flatMap((s) => s.matches ?? []);
      setOrigins(list);
      setEnabled(!!origin && list.includes(origin));
    } catch (e) {
      setMessage(String(e));
    }
  }
  useEffect(() => {
    void reload();
    const listener = (m: { marklyEvent?: string }) => {
      if (m.marklyEvent === "changed") void reload();
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, []);
  async function enable() {
    if (!origin) return;
    try {
      const granted = await browser.permissions.request({ origins: [origin] });
      if (!granted) {
        setMessage("未获得权限，仍可点击插件临时启用。");
        return;
      }
      await rpc({ type: "enable-site", origin });
      setMessage("此网站已启用自动批注，重新打开网页即可恢复。");
      await reload();
    } catch (e) {
      setMessage("启用失败：" + String(e));
    }
  }
  async function disable(value: string) {
    try {
      await rpc({ type: "disable-site", origin: value });
      if (value !== "file:///*")
        await browser.permissions.remove({ origins: [value] });
      await reload();
      setMessage("已关闭此网站的自动启用。");
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function exportData() {
    try {
      const backup = await rpc<Backup>({ type: "export" });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(backup, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `markly-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("备份已导出。");
    } catch (e) {
      setMessage(String(e));
    }
  }
  async function importData(file: File) {
    setBusy(true);
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("文件超过 50 MB");
      const backup = JSON.parse(await file.text());
      const result = await rpc<{ added: number; skipped: number }>({
        type: "import",
        backup,
      });
      setMessage(
        `导入完成：新增 ${result.added} 条，跳过 ${result.skipped} 条。`,
      );
      await reload();
    } catch (e) {
      setMessage("导入失败，未写入数据：" + String(e));
    } finally {
      setBusy(false);
    }
  }
  async function openPage(url: string, annotation?: Annotation) {
    try {
      await browser.storage.local.set({
        jump: annotation
          ? { id: annotation.id, pageId: url, at: Date.now() }
          : null,
      });
      await browser.tabs.create({ url });
    } catch (e) {
      setMessage(String(e));
    }
  }
  const query = search.trim().toLocaleLowerCase();
  const grouped = useMemo(() => {
    const byPage = new Map<string, Annotation[]>();
    for (const a of data?.annotations ?? []) {
      const group = byPage.get(a.pageId);
      if (group) group.push(a);
      else byPage.set(a.pageId, [a]);
    }
    return byPage;
  }, [data]);
  const pages = (data?.pages ?? [])
    .flatMap((p) => {
      const all = grouped.get(p.id);
      if (!all?.length) return [];
      const pageMatch = [p.title, p.url].some((v) =>
        v.toLocaleLowerCase().includes(query),
      );
      const notes = pageMatch
        ? all
        : all.filter((a) =>
            [a.note, excerpt(a)].some((v) =>
              v.toLocaleLowerCase().includes(query),
            ),
          );
      return notes.length ? [{ p, notes, count: all.length }] : [];
    })
    .sort((a, b) => b.p.updatedAt - a.p.updatedAt);
  return (
    <TooltipScope>
      <main className={`${s.root} ${ui.archive}`}>
        <div className={ui.shell}>
          <header className={ui.masthead}>
            <div>
              <div className={s.brand}>
                <span className={s.brandIcon}>
                  <Icon name="pen" size={25} />
                </span>
                <b>Markly</b>
              </div>
            </div>
            <div className={ui.actions}>
              <button onClick={() => void exportData()}>
                <Icon name="download" size={17} />
                导出备份
              </button>
              <button
                disabled={busy}
                onClick={() => document.getElementById("import")?.click()}
              >
                <Icon name="upload" size={17} />
                {busy ? "导入中…" : "导入备份"}
              </button>
              <input
                id="import"
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importData(file);
                  e.target.value = "";
                }}
              />
            </div>
          </header>
          {message && (
            <p role="status" style={{ padding: "12px 0", fontSize: 13 }}>
              {message}
            </p>
          )}
          <div className={ui.heading}>
            <div>
              <h1>全部标记</h1>
              <p>
                {data
                  ? grouped.size +
                    " 个网页 · " +
                    data.annotations.length +
                    " 条批注"
                  : "正在读取…"}
              </p>
            </div>
            <label className={ui.search}>
              <Icon name="search" size={16} />
              <input
                placeholder="搜索标题、摘录或备注"
                aria-label="搜索全部标记"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {!data ? (
            <p className={s.loading}>正在读取本地标记…</p>
          ) : pages.length === 0 ? (
            <div className={s.empty}>
              <Icon name="book" size={40} />
              <strong>
                {search ? "没有找到相关标记" : "你的思考，从第一笔开始"}
              </strong>
              <p>
                打开一篇网页，点击 Chrome 工具栏中的 Markly。
                <br />
                划重点、圈内容、写备注，之后在这里找回。
              </p>
            </div>
          ) : (
            pages.map(({ p, notes, count }, index) => {
              const open =
                expanded === p.id ||
                (query !== "" && expanded !== "closed:" + p.id);
              const date = new Date(p.updatedAt);
              return (
                <div key={p.id}>
                  {(index === 0 ||
                    month(pages[index - 1]!.p.updatedAt) !==
                      month(p.updatedAt)) && (
                    <h2 className={ui.month}>{month(p.updatedAt)}</h2>
                  )}
                  <section className={ui.entry}>
                    <div className={ui.row}>
                      <time dateTime={date.toISOString()}>
                        {String(date.getDate()).padStart(2, "0")}
                      </time>
                      <button
                        className={ui.summary}
                        aria-expanded={open}
                        aria-label={
                          (open ? "收起标记" : "展开标记") +
                          "：" +
                          (p.title || p.url)
                        }
                        onClick={() =>
                          setExpanded(open ? "closed:" + p.id : p.id)
                        }
                      >
                        <strong>{p.title || "未命名网页"}</strong>
                        <span title={p.url}>{p.url}</span>
                      </button>
                      <span className={ui.count}>{count} 条</span>
                      <button
                        aria-label="打开原网页"
                        data-tip="打开原网页"
                        onClick={() => void openPage(p.url)}
                      >
                        <Icon name="external" size={16} />
                      </button>
                    </div>
                    {open && (
                      <div className={ui.notes}>
                        {notes.map((a) => (
                          <div key={a.id} className={ui.note}>
                            <i style={{ background: COLORS[a.color] }} />
                            <button
                              className={ui.read}
                              onClick={() => void openPage(p.url, a)}
                            >
                              <span>{excerpt(a)}</span>
                              {a.kind !== "page" && a.note && (
                                <small>{a.note}</small>
                              )}
                            </button>
                            <button
                              aria-label="删除此标记"
                              data-tip="删除此标记"
                              onClick={() => setDeleteTarget(a)}
                            >
                              <Icon name="delete" size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              );
            })
          )}
          {origin && (
            <section className={ui.permission}>
              <h3>在此网站始终启用</h3>
              <p className={s.url}>{origin}</p>
              <p className={s.muted}>
                允许后，打开网站即可划词批注，并自动恢复已有标记。
              </p>
              <button
                className={enabled ? "" : s.primary}

                onClick={() => void (enabled ? disable(origin!) : enable())}
              >
                {enabled ? "关闭自动启用" : "允许并启用"}
                <Icon name={enabled ? "close" : "check"} size={15} />
              </button>
              {origin === "file:///*" && (
                <p className={s.muted}>
                  本地 HTML 还需在 Chrome 扩展详情中开启“允许访问文件网址”。
                </p>
              )}
            </section>
          )}
          {origins.length > 0 && (
            <section style={{ marginTop: 32 }}>
              <h3 style={{ fontSize: 14 }}>自动启用的网站</h3>
              {origins.map((o) => (
                <div
                  key={o}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 8,
                  }}
                >
                  <span className={s.muted}>{o}</span>
                  <button onClick={() => void disable(o)}>移除</button>
                </div>
              ))}
            </section>
          )}
          <p className={s.muted} style={{ marginTop: 36, textAlign: "center" }}>
            只保存在这台浏览器 · 建议定期导出备份
          </p>
        </div>
        {deleteTarget && (
          <div
            className={s.dialogBackdrop}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !deleting) setDeleteTarget(null);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label="删除标记"
              className={s.confirmDialog}
            >
              <h3>删除这条标记？</h3>
              <p>原网页内容不会改变。</p>
              <button
                autoFocus
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                取消
              </button>
              <button
                className={s.danger}
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await rpc({
                      type: "delete",
                      pageId: deleteTarget.pageId,
                      id: deleteTarget.id,
                      expectedUpdatedAt: deleteTarget.updatedAt,
                      opId: crypto.randomUUID(),
                    });
                    setDeleteTarget(null);
                    await reload();
                  } catch (err) {
                    setMessage(String(err));
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? "删除中…" : "删除"}
              </button>
            </section>
          </div>
        )}
      </main>
    </TooltipScope>
  );
}
createRoot(document.getElementById("root")!).render(<History />);

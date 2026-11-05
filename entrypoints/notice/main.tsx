import { createRoot } from "react-dom/client";
import { Icon } from "../../components/Icon";
import s from "../../components/Markly.module.css";
createRoot(document.getElementById("root")!).render(
  <main className={s.root}>
    <section className={s.notice}>
      <span className={s.brandIcon}>
        <Icon name="pen" />
      </span>
      <h1 style={{ marginTop: 20 }}>这个页面暂时不能批注</h1>
      <p>
        {new URLSearchParams(location.search).get("error") ||
          "请打开普通 HTML 网页后，再点击 Markly。"}
      </p>
      <p>Chrome 设置页、扩展商店和内置 PDF 阅读器不支持网页批注。</p>
      <p>
        如果是本地 HTML：在 Chrome 的“管理扩展程序 → Markly →
        详情”中开启“允许访问文件网址”，然后重新打开文件。
      </p>
    </section>
  </main>,
);

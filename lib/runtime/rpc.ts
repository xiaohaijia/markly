import type { Request, Reply } from "../model";
export function withDeadline<T>(request: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "后台确认超时，请重试。未确认的内容仍保留，重试不会重复创建标记。",
          ),
        ),
      ms,
    );
    request.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
export async function rpc<T>(request: Request): Promise<T> {
  const { browser } = await import("wxt/browser");
  const result = await withDeadline(
    browser.runtime.sendMessage({ markly: true, ...request }) as Promise<Reply>,
    request.type === "import" || request.type === "export" ? 60000 : 15000,
  );
  if (!result?.ok)
    throw new Error(result?.error || "插件连接已断开，请重新启用插件");
  return result.data as T;
}

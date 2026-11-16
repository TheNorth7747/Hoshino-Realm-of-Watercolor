/**
 * 统一错误类型与基础错误提示（A0）。
 * 渲染器创建失败、DOM 缺失等启动期错误必须走 AppError，由 main.ts 渲染可见提示，
 * 而不是只留一条控制台报错（PRD AC-09 / AC-11 的可调试性前提）。
 */
export type AppErrorCode =
  "webgl-unavailable" | "renderer-failed" | "dom-missing" | "boot-failed" | "system-registration";

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "AppError";
    this.code = code;
  }
}

export interface FatalErrorDetail {
  readonly message: string;
  readonly stack: string | null;
  readonly code: string | null;
}

export function toFatalErrorDetail(error: unknown): FatalErrorDetail {
  if (error instanceof AppError) {
    return { message: error.message, stack: error.stack ?? null, code: error.code };
  }
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack ?? null, code: null };
  }
  if (typeof error === "string") {
    return { message: error, stack: null, code: null };
  }
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(error);
  } catch {
    serialized = undefined;
  }
  return { message: serialized ?? String(error), stack: null, code: null };
}

/** 安装 window 级错误兜底，返回卸载函数。 */
export function installGlobalErrorHandlers(
  report: (error: unknown, context: string) => void,
): () => void {
  const onError = (event: ErrorEvent): void => {
    report(event.error ?? event.message, "window:error");
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    report(event.reason, "window:unhandledrejection");
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}

/** 在 #fatal-error 覆盖层显示可读错误。 */
export function showFatalError(detail: FatalErrorDetail): void {
  const overlay = document.querySelector<HTMLElement>("#fatal-error");
  if (!overlay) return;

  const messageNode = overlay.querySelector<HTMLElement>(".fatal-error__message");
  if (messageNode) {
    const codeLine = detail.code ? `[${detail.code}] ` : "";
    messageNode.textContent = `${codeLine}${detail.message}`;
  }

  const stackNode = overlay.querySelector<HTMLElement>(".fatal-error__stack");
  if (stackNode) {
    stackNode.textContent = detail.stack ?? "";
  }

  overlay.hidden = false;
  overlay.dataset["state"] = "visible";
}

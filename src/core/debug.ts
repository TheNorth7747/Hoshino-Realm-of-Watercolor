/**
 * 调试通道与调试面板（A0）。
 * `?debug=1` 时启用：FPS、Draw Calls、三角面、系统列表，以及各模块注册的自定义指标。
 * A4 的 `src/ui/DebugPanel.ts` 可以整体替换 DebugOverlay，但 DebugApi 契约保持不变。
 */
import type {
  DebugApi,
  DebugSnapshot,
  DebugStatSource,
  DebugValue,
  Unsubscribe,
} from "./contracts";

const LOG_LIMIT = 100;
const ERROR_LIMIT = 20;

export class GameDebug implements DebugApi {
  readonly enabled: boolean;

  private readonly sources = new Map<string, DebugStatSource>();
  private readonly logs: string[] = [];
  private readonly errors: string[] = [];
  private snapshotProvider: (() => DebugSnapshot) | null = null;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  setSnapshotProvider(provider: () => DebugSnapshot): void {
    this.snapshotProvider = provider;
  }

  get errorCount(): number {
    return this.errors.length;
  }

  get errorMessages(): readonly string[] {
    return this.errors;
  }

  log(message: string, detail?: unknown): void {
    if (!this.enabled) return;
    this.pushRing(this.logs, message);
    if (detail === undefined) {
      console.info(`[starwater] ${message}`);
    } else {
      console.info(`[starwater] ${message}`, detail);
    }
  }

  reportError(error: unknown, context?: string): void {
    const message = error instanceof Error ? error.message : String(error);
    const line = context ? `${context}: ${message}` : message;
    this.pushRing(this.errors, line);
    if (this.enabled) {
      console.error(`[starwater] ${line}`, error);
    }
  }

  registerStatSource(source: DebugStatSource): Unsubscribe {
    this.sources.set(source.id, source);
    return () => {
      this.sources.delete(source.id);
    };
  }

  readStats(): Readonly<Record<string, DebugValue>> {
    const merged: Record<string, DebugValue> = {};
    for (const source of this.sources.values()) {
      for (const [key, value] of Object.entries(source.read())) {
        merged[`${source.id}.${key}`] = value;
      }
    }
    return merged;
  }

  snapshot(): DebugSnapshot {
    if (this.snapshotProvider) return this.snapshotProvider();
    return {
      enabled: this.enabled,
      running: false,
      elapsedSeconds: 0,
      fps: 0,
      frameTimeMs: 0,
      drawCalls: 0,
      triangles: 0,
      systems: [],
      errorCount: this.errors.length,
    };
  }

  private pushRing(target: string[], line: string): void {
    target.push(line);
    const limit = target === this.errors ? ERROR_LIMIT : LOG_LIMIT;
    if (target.length > limit) target.splice(0, target.length - limit);
  }
}

export interface DebugOverlayOptions {
  readonly container: HTMLElement;
  readonly debug: DebugApi;
  readonly intervalMs?: number;
}

interface RowNodes {
  readonly value: HTMLElement;
}

const BASE_ROWS: readonly (readonly [string, string])[] = [
  ["fps", "FPS"],
  ["frame", "帧时间 (ms)"],
  ["calls", "Draw Calls"],
  ["triangles", "三角面"],
  ["elapsed", "运行时长 (s)"],
  ["systems", "已挂载系统"],
];

export class DebugOverlay {
  private readonly container: HTMLElement;
  private readonly debug: DebugApi;
  private readonly intervalMs: number;
  private readonly rows = new Map<string, RowNodes>();
  private readonly extraBody: HTMLElement;
  private readonly errorsNode: HTMLElement;
  private timer: number | null = null;

  constructor(options: DebugOverlayOptions) {
    this.container = options.container;
    this.debug = options.debug;
    this.intervalMs = options.intervalMs ?? 250;

    this.container.hidden = false;
    this.container.dataset["state"] = "visible";
    this.container.replaceChildren();

    const title = document.createElement("div");
    title.className = "debug-panel__title";
    title.textContent = "Hoshino Debug";
    this.container.append(title);

    const list = document.createElement("dl");
    list.className = "debug-panel__list";
    for (const [key, label] of BASE_ROWS) {
      list.append(this.createRow(key, label));
    }
    this.container.append(list);

    this.extraBody = document.createElement("div");
    this.extraBody.className = "debug-panel__extra";
    this.container.append(this.extraBody);

    this.errorsNode = document.createElement("div");
    this.errorsNode.className = "debug-panel__errors";
    this.container.append(this.errorsNode);
  }

  start(): void {
    if (this.timer !== null) return;
    this.render();
    this.timer = window.setInterval(() => this.render(), this.intervalMs);
  }

  stop(): void {
    if (this.timer === null) return;
    window.clearInterval(this.timer);
    this.timer = null;
  }

  dispose(): void {
    this.stop();
    this.container.replaceChildren();
    this.container.hidden = true;
    delete this.container.dataset["state"];
  }

  private createRow(key: string, label: string): HTMLElement {
    const term = document.createElement("dt");
    term.textContent = label;
    const value = document.createElement("dd");
    value.textContent = "-";
    const wrapper = document.createElement("div");
    wrapper.className = "debug-panel__row";
    wrapper.append(term, value);
    this.rows.set(key, { value });
    return wrapper;
  }

  private setRow(key: string, text: string): void {
    const row = this.rows.get(key);
    if (row) row.value.textContent = text;
  }

  private render(): void {
    const snapshot = this.debug.snapshot();

    this.setRow("fps", snapshot.fps.toFixed(1));
    this.setRow("frame", snapshot.frameTimeMs.toFixed(2));
    this.setRow("calls", String(snapshot.drawCalls));
    this.setRow("triangles", String(snapshot.triangles));
    this.setRow("elapsed", snapshot.elapsedSeconds.toFixed(1));
    this.setRow("systems", snapshot.systems.length === 0 ? "(none)" : snapshot.systems.join(", "));

    const stats = this.debug.readStats();
    const entries = Object.entries(stats);
    this.extraBody.replaceChildren();
    if (entries.length > 0) {
      const list = document.createElement("dl");
      list.className = "debug-panel__list";
      for (const [key, value] of entries) {
        const term = document.createElement("dt");
        term.textContent = key;
        const cell = document.createElement("dd");
        cell.textContent = String(value);
        const wrapper = document.createElement("div");
        wrapper.className = "debug-panel__row";
        wrapper.append(term, cell);
        list.append(wrapper);
      }
      this.extraBody.append(list);
    }

    const errors = this.debug.errorMessages;
    this.errorsNode.textContent =
      errors.length === 0 ? "" : `错误 ${errors.length}：${errors[errors.length - 1] ?? ""}`;
    this.errorsNode.dataset["count"] = String(errors.length);
  }
}

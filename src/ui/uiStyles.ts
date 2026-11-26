/**
 * A4 UI 样式（自注入，不改 A0 的 styles/main.css）。
 * 引用计数：首个组件 init 时注入，最后一个组件 dispose 时移除。
 * 视觉方向：纸张底色 + 墨色文字 + 低饱和水彩点缀（PRD 10）。
 */
const UI_CSS = `
.sw-hud__objective,
.sw-hud__shards,
.sw-prompt {
  position: absolute;
  padding: 6px 14px;
  border: 1px solid rgba(47, 43, 38, 0.18);
  border-radius: 999px;
  background: rgba(251, 247, 239, 0.85);
  color: #2f2b26;
  font-size: 13px;
  line-height: 1.5;
  box-shadow: 0 2px 10px rgba(47, 43, 38, 0.08);
  backdrop-filter: blur(3px);
  pointer-events: none;
}
.sw-hud__objective {
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(560px, calc(100% - 160px));
  text-align: center;
}
.sw-hud__shards {
  top: 16px;
  right: 16px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
.sw-prompt {
  bottom: 112px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 13px;
}
.sw-hud__objective[hidden],
.sw-hud__shards[hidden],
.sw-prompt[hidden],
.sw-dialogue[hidden],
.sw-ending[hidden],
.sw-debug[hidden] {
  display: none;
}
.sw-dialogue {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  width: min(640px, calc(100% - 48px));
  padding: 14px 18px 12px;
  border: 1px solid rgba(47, 43, 38, 0.2);
  border-radius: 14px;
  background: rgba(251, 247, 239, 0.94);
  color: #2f2b26;
  box-shadow: 0 10px 30px rgba(47, 43, 38, 0.16);
  pointer-events: auto;
  cursor: pointer;
}
.sw-dialogue__speaker {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: #8a6d3b;
  margin-bottom: 4px;
}
.sw-dialogue__line {
  font-size: 15px;
  line-height: 1.7;
  min-height: 1.7em;
}
.sw-dialogue__footer {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: #6b6257;
}
.sw-ending {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.sw-ending__card {
  max-width: 420px;
  width: calc(100% - 48px);
  padding: 28px 36px;
  border: 1px solid rgba(47, 43, 38, 0.2);
  border-radius: 16px;
  background: rgba(251, 247, 239, 0.94);
  color: #2f2b26;
  text-align: center;
  box-shadow: 0 18px 48px rgba(47, 43, 38, 0.22);
  pointer-events: auto;
}
.sw-ending__title {
  margin: 0 0 12px;
  font-size: 20px;
  letter-spacing: 0.08em;
}
.sw-ending__line {
  margin: 0 0 6px;
  font-size: 14px;
  line-height: 1.7;
  color: #6b6257;
}
.sw-ending__elapsed {
  margin: 12px 0 0;
  font-size: 12px;
  color: #8a6d3b;
  font-variant-numeric: tabular-nums;
}
.sw-ending__restart {
  margin-top: 18px;
  padding: 10px 26px;
  border: 1px solid #2f2b26;
  border-radius: 999px;
  background: #2f2b26;
  color: #f2ede4;
  font-size: 14px;
  letter-spacing: 0.06em;
  cursor: pointer;
}
.sw-ending__restart:hover {
  opacity: 0.86;
}
.sw-debug {
  position: absolute;
  left: 12px;
  bottom: 12px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(24, 22, 20, 0.82);
  color: #f4efe6;
  font-family: "Cascadia Mono", Consolas, monospace;
  font-size: 12px;
  pointer-events: auto;
}
.sw-debug__stats {
  margin-bottom: 6px;
  opacity: 0.85;
}
.sw-debug__buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sw-debug__button {
  padding: 3px 8px;
  border: 1px solid rgba(244, 239, 230, 0.4);
  border-radius: 6px;
  background: transparent;
  color: #f4efe6;
  font-size: 12px;
  cursor: pointer;
}
.sw-debug__button:hover {
  background: rgba(244, 239, 230, 0.16);
}
.sw-minimal-hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.sw-controls-hint {
  position: absolute;
  bottom: 14px;
  left: 50%;
  transform: translateX(-50%);
  padding: 5px 14px;
  border-radius: 6px;
  border: 1px solid rgba(47, 43, 38, 0.14);
  background: rgba(247, 243, 234, 0.68);
  color: rgba(47, 43, 38, 0.84);
  font-size: 11px;
  letter-spacing: 0.02em;
  white-space: nowrap;
  backdrop-filter: blur(4px);
  pointer-events: none;
}
.sw-minimal-actions {
  position: absolute;
  top: 14px;
  right: 16px;
  display: flex;
  gap: 8px;
  pointer-events: auto;
}
.sw-minimal-btn {
  padding: 5px 12px;
  border: 1px solid rgba(47, 43, 38, 0.18);
  border-radius: 999px;
  background: rgba(251, 247, 239, 0.78);
  color: #2f2b26;
  font-size: 12px;
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.sw-minimal-btn:hover {
  background: rgba(251, 247, 239, 0.96);
}
`;

let mountCount = 0;
let styleNode: HTMLStyleElement | null = null;
let ownerDocument: Document | null = null;

export function ensureUiStyles(): void {
  if (ownerDocument !== document) {
    mountCount = 0;
    styleNode = null;
    ownerDocument = document;
  }
  mountCount += 1;
  if (mountCount === 1) {
    styleNode = document.createElement("style");
    styleNode.textContent = UI_CSS;
    document.head.append(styleNode);
  }
}

export function releaseUiStyles(): void {
  if (ownerDocument !== document) {
    mountCount = 0;
    styleNode = null;
    ownerDocument = document;
    return;
  }
  mountCount = Math.max(0, mountCount - 1);
  if (mountCount === 0 && styleNode) {
    styleNode.remove();
    styleNode = null;
  }
}

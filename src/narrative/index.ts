/**
 * A4 模块入口：故事、星屑、伙伴与 UI 的唯一装配点。
 *
 * 集成方式（由集成者在 main.ts 的 createSystems() 中调用）：
 *   import { createNarrativeSystems } from "./narrative";
 *   return [...createNarrativeSystems({ player: playerController })];
 *
 * player 只需实现共享契约 PlayerSource（A2 的 PlayerController 或测试替身）。
 * 返回顺序即同阶段内的执行顺序：companion → story → HUD/对话/结局/调试。
 */
import type { GameSystem, PlayerSource } from "../core/contracts";
import { CompanionController } from "../companion/CompanionController";
import { StorySystem } from "./StorySystem";
import { HUD } from "../ui/HUD";
import { DialogueBox } from "../ui/DialogueBox";
import { EndingOverlay } from "../ui/EndingOverlay";
import { DebugPanel } from "../ui/DebugPanel";

export interface NarrativeOptions {
  readonly player: PlayerSource;
}

export function createNarrativeSystems(options: NarrativeOptions): GameSystem[] {
  const dialogue = new DialogueBox();
  const story = new StorySystem({ player: options.player, dialogue });
  const companion = new CompanionController({ player: options.player });
  const hud = new HUD(story);
  const ending = new EndingOverlay();
  const debugPanel = new DebugPanel(story);
  return [companion, story, hud, dialogue, ending, debugPanel];
}

export { StorySystem } from "./StorySystem";
export type {
  DialogueController,
  HudStateSource,
  StoryHudState,
  StorySystemOptions,
} from "./StorySystem";
export { STORY, STORY_NODES, parseStoryData } from "./storyData";
export type { StoryData, StoryNodeData } from "./storyData";
export { CompanionController } from "../companion/CompanionController";
export { HUD } from "../ui/HUD";
export { DialogueBox } from "../ui/DialogueBox";
export { EndingOverlay } from "../ui/EndingOverlay";
export { DebugPanel } from "../ui/DebugPanel";

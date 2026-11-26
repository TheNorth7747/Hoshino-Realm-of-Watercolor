/**
 * 叙事与探索模块入口（V0.3 保留传统三节点装配 + 新增极简自由探索装配）。
 */
import type { GameSystem, PlayerSource } from "../core/contracts";
import { CompanionController } from "../companion/CompanionController";
import { FreeExploreSystem } from "./FreeExploreSystem";
import { StorySystem } from "./StorySystem";
import { HUD } from "../ui/HUD";
import { MinimalHud, type MinimalHudOptions } from "../ui/MinimalHud";
import { DialogueBox } from "../ui/DialogueBox";
import { EndingOverlay } from "../ui/EndingOverlay";
import { DebugPanel } from "../ui/DebugPanel";
import { FreeExploreDebugPanel } from "../ui/FreeExploreDebugPanel";

export interface NarrativeOptions {
  readonly player: PlayerSource;
}

export interface MinimalExploreOptions {
  readonly player: PlayerSource;
  readonly hud?: MinimalHudOptions;
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

export function createMinimalExploreSystems(options: MinimalExploreOptions): GameSystem[] {
  const explore = new FreeExploreSystem({ player: options.player });
  const hud = new MinimalHud(options.hud);
  const debugPanel = new FreeExploreDebugPanel(explore);
  return [explore, hud, debugPanel];
}

export { FreeExploreSystem } from "./FreeExploreSystem";
export type { FreeExploreOptions, FreeExploreState } from "./FreeExploreSystem";
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
export { MinimalHud, CONTROLS_HINT_TEXT, type MinimalHudOptions } from "../ui/MinimalHud";
export { DialogueBox } from "../ui/DialogueBox";
export { EndingOverlay } from "../ui/EndingOverlay";
export { DebugPanel } from "../ui/DebugPanel";
export { FreeExploreDebugPanel } from "../ui/FreeExploreDebugPanel";

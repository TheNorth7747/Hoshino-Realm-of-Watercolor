/**
 * A4 测试替身（PRD A4 交付要求 5）。
 * 玩家与世界尚未集成：PlayerSource 用 FakePlayerSource，GameContext 用真实 EventBus/Scene
 * 加最小 DOM 替身组装；不修改任何其他模块。
 */
import { Group, PerspectiveCamera, Scene, Vector3 } from "three";
import type { WebGLRenderer } from "three";
import type {
  GameContext,
  GameEvents,
  GameSystem,
  PlayerSnapshot,
  PlayerSource,
  StoryNodeId,
} from "../../../src/core/contracts";
import { EventBus } from "../../../src/core/EventBus";
import { GameDebug } from "../../../src/core/debug";
import { readEngineSettings } from "../../../src/core/config";
import {
  LANDMARKS,
  WORLD_BOUNDS,
  sampleTerrainHeight,
  spawnPosition,
} from "../../../src/config/world";
import type { DialogueController } from "../../../src/narrative/StorySystem";
import { nodeData, nodeLandmark } from "../../../src/narrative/storyData";

export class FakePlayerSource implements PlayerSource {
  readonly position: Vector3 = spawnPosition();
  headingRadians = 0;
  speed = 0;
  grounded = true;

  getPlayerSnapshot(): PlayerSnapshot {
    return {
      position: this.position,
      headingRadians: this.headingRadians,
      speed: this.speed,
      grounded: this.grounded,
    };
  }

  moveTo(x: number, z: number): void {
    this.position.set(x, sampleTerrainHeight(x, z), z);
  }

  moveToNode(id: StoryNodeId): void {
    const landmark = LANDMARKS[nodeLandmark(id)];
    this.moveTo(landmark.x, landmark.z);
  }

  moveToShard(id: StoryNodeId): void {
    const position = shardWorldPosition(id);
    this.moveTo(position.x, position.z);
  }
}

export class StubDialogue implements DialogueController {
  constructor(public open = false) {}

  get isOpen(): boolean {
    return this.open;
  }

  advance(): void {}

  close(): void {
    this.open = false;
  }
}

export function shardWorldPosition(id: StoryNodeId): Vector3 {
  const landmark = LANDMARKS[nodeLandmark(id)];
  const offset = nodeData(id).shardOffset;
  return new Vector3(
    landmark.x + offset.x,
    sampleTerrainHeight(landmark.x, landmark.z),
    landmark.z + offset.z,
  );
}

/* ============================================================================
 * 最小 DOM 替身：只覆盖 A4 UI 用到的 API 子集。
 * ========================================================================== */

export interface FakeEvent {
  readonly type: string;
  preventDefault(): void;
  stopPropagation(): void;
}

type FakeListener = (event: FakeEvent) => void;

export class FakeElement {
  readonly tagName: string;
  className = "";
  hidden = false;
  type = "";
  readonly dataset: Record<string, string> = {};
  readonly attributes: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  private ownText = "";
  private readonly listeners = new Map<string, Set<FakeListener>>();

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.ownText = value;
    for (const child of [...this.children]) child.remove();
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.remove();
      node.parentElement = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const child of [...this.children]) child.remove();
    this.append(...nodes);
  }

  remove(): void {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  addEventListener(type: string, listener: FakeListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  click(): void {
    const event: FakeEvent = {
      type: "click",
      preventDefault(): void {},
      stopPropagation(): void {},
    };
    for (const listener of [...(this.listeners.get("click") ?? [])]) listener(event);
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  findByClass(className: string): FakeElement | null {
    if (this.className.split(" ").includes(className)) return this;
    for (const child of this.children) {
      const found = child.findByClass(className);
      if (found) return found;
    }
    return null;
  }

  findAllByClass(className: string): FakeElement[] {
    const result: FakeElement[] = [];
    if (this.className.split(" ").includes(className)) result.push(this);
    for (const child of this.children) result.push(...child.findAllByClass(className));
    return result;
  }
}

export class FakeDocument {
  readonly head = new FakeElement("head");

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName);
  }
}

/* ============================================================================
 * 测试上下文与工具
 * ========================================================================== */

export interface TestBundle {
  readonly context: GameContext;
  readonly events: EventBus;
  readonly player: FakePlayerSource;
  readonly scene: Scene;
  readonly uiRoot: FakeElement;
}

export function createTestBundle(options?: { readonly debug?: boolean }): TestBundle {
  const events = new EventBus();
  const player = new FakePlayerSource();
  const scene = new Scene();
  const uiRoot = new FakeElement("div");
  const settings = readEngineSettings(options?.debug === true ? "?debug=1" : "");
  const context: GameContext = {
    canvas: {} as HTMLCanvasElement,
    scene,
    camera: new PerspectiveCamera(),
    renderer: {} as WebGLRenderer,
    events,
    debug: new GameDebug(settings.debugEnabled),
    settings,
    world: { bounds: WORLD_BOUNDS, sampleHeight: sampleTerrainHeight },
    uiRoot: uiRoot as unknown as HTMLElement,
    worldRoot: new Group(),
  };
  return { context, events, player, scene, uiRoot };
}

export function eventLog<K extends keyof GameEvents>(events: EventBus, type: K): GameEvents[K][] {
  const log: GameEvents[K][] = [];
  events.on(type, (payload) => {
    log.push(payload);
  });
  return log;
}

export function advanceAll(
  systems: readonly GameSystem[],
  context: GameContext,
  seconds: number,
  step = 1 / 60,
): void {
  const frames = Math.max(1, Math.ceil(seconds / step));
  for (let frame = 0; frame < frames; frame += 1) {
    for (const system of systems) system.update?.(step, context);
  }
}

export function shardGroupChildren(bundle: TestBundle): number {
  const group = bundle.scene.getObjectByName("story-shards");
  return group ? group.children.length : 0;
}

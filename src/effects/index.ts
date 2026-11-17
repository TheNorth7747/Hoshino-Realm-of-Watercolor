/** A5 效果模块公共导出：集成者从 src/effects 挂载 VfxSystem。 */
export { VfxSystem, type VfxSystemOptions, type VfxStats } from "./VfxSystem";
export {
  PetalEmitter,
  defaultRandom,
  type ParticleCounts,
  type PetalEmitterOptions,
  type RandomSource,
} from "./Petals";
export { RippleEmitter, type RippleEmitterOptions } from "./Ripples";
export { SlotPool } from "./SlotPool";
export {
  createAudioManager,
  type AudioManager,
  type AudioManagerOptions,
  type AudioCue,
} from "./AudioManager";

/** A5 效果模块公共导出：集成者从 src/effects 挂载 VfxSystem。 */
export { VfxSystem, type VfxSystemOptions, type VfxStats } from "./VfxSystem";
export {
  PetalEmitter,
  defaultRandom,
  PETAL_LAYERS,
  PETAL_OVERLAY_AREA_RATIO_CAP,
  type ParticleCounts,
  type PetalEmitterOptions,
  type PetalLayerCounts,
  type PetalLayerId,
  type PetalLayerSpec,
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
export { DebussyPiano, ARABESQUE_SCORE, midiToHz, noteToMidi } from "./DebussyPiano";
export type { DebussyPianoOptions, PianoNoteEvent } from "./DebussyPiano";
export { AudioSystem } from "./AudioSystem";

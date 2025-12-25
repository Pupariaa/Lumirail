import { create } from 'zustand';
import { TimelineModel } from '../../shared/simulation/TimelineModel';
import { RenderingEngine } from '../../shared/simulation/RenderingEngine';
import { PresetRegistry } from '../../shared/simulation/PresetRegistry';
import { registerDefaultPresets } from '../../shared/simulation/presets';
import { HardwareModel } from '../../shared/simulation/hardware/HardwareModel';
import { Clip, TimelineTime, ResolvedFrame } from '../../shared/simulation/types';

const hardwareModel = new HardwareModel();
const totalLEDs = hardwareModel.getTotalLEDCount();
const timelineModel = new TimelineModel(600);
const renderingEngine = new RenderingEngine(totalLEDs, hardwareModel);
const presetRegistry = renderingEngine.getPresetRegistry();
registerDefaultPresets(presetRegistry);

interface SimulationState {
  hardwareModel: HardwareModel;
  timelineModel: TimelineModel;
  renderingEngine: RenderingEngine;
  presetRegistry: PresetRegistry;
  currentFrame: ResolvedFrame | null;
  maxLEDs: number;
  fps: number;
  animationFrameId: number | null;
  lastPlayTime: number | null;

  initialize: () => void;
  addClip: (clip: Clip) => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  setTimelineDuration: (duration: TimelineTime) => void;
  setPlayhead: (time: TimelineTime) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  render: () => void;
  setMaxLEDs: (count: number) => void;
  setFPS: (fps: number) => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  hardwareModel,
  timelineModel,
  renderingEngine,
  presetRegistry,
  currentFrame: null,
  maxLEDs: totalLEDs,
  fps: 30,
  animationFrameId: null,
  lastPlayTime: null,

  initialize: () => {
    const state = get();
    state.renderingEngine.setTimelineDuration(state.timelineModel.getDuration());
    state.render();
  },

  addClip: (clip: Clip) => {
    const state = get();
    state.timelineModel.addClip(clip);
    state.render();
  },

  removeClip: (clipId: string) => {
    const state = get();
    state.timelineModel.removeClip(clipId);
    state.render();
  },

  updateClip: (clipId: string, updates: Partial<Clip>) => {
    const state = get();
    state.timelineModel.updateClip(clipId, updates);
    state.render();
  },

  setTimelineDuration: (duration: TimelineTime) => {
    const state = get();
    state.timelineModel.setDuration(duration);
    state.renderingEngine.setTimelineDuration(duration);
    state.render();
  },

  setPlayhead: (time: TimelineTime) => {
    const state = get();
    state.timelineModel.setPlayhead(time);
    state.render();
  },

  play: () => {
    const state = get();
    if (state.animationFrameId !== null) return;

    state.timelineModel.setPlaying(true);
    set({ lastPlayTime: Date.now() / 1000 });
    state.render();

    const animate = () => {
      const currentState = get();
      if (!currentState.timelineModel.isPlaying()) {
        set({ animationFrameId: null });
        return;
      }

      const playhead = currentState.timelineModel.getPlayhead();
      const duration = currentState.timelineModel.getDuration();
      const now = Date.now() / 1000;
      
      if (currentState.lastPlayTime === null) {
        set({ lastPlayTime: now });
        const id = requestAnimationFrame(animate);
        set({ animationFrameId: id });
        return;
      }
      
      const deltaTime = now - currentState.lastPlayTime;
      set({ lastPlayTime: now });
      
      let newPlayhead = playhead + deltaTime;
      if (newPlayhead >= duration) {
        newPlayhead = duration;
        currentState.timelineModel.setPlaying(false);
        set({ animationFrameId: null });
      } else {
        const id = requestAnimationFrame(animate);
        set({ animationFrameId: id });
      }

      currentState.timelineModel.setPlayhead(newPlayhead);
      currentState.render();
    };

    const id = requestAnimationFrame(animate);
    set({ animationFrameId: id });
  },

  pause: () => {
    const state = get();
    state.timelineModel.setPlaying(false);
    if (state.animationFrameId !== null) {
      cancelAnimationFrame(state.animationFrameId);
      set({ animationFrameId: null, lastPlayTime: null });
    }
  },

  stop: () => {
    const state = get();
    state.timelineModel.setPlaying(false);
    state.timelineModel.setPlayhead(0);
    if (state.animationFrameId !== null) {
      cancelAnimationFrame(state.animationFrameId);
      set({ animationFrameId: null, lastPlayTime: null });
    }
    state.render();
  },

  render: () => {
    const state = get();
    const timeline = state.timelineModel.getTimeline();
    const playhead = timeline.playhead;
    const frame = state.renderingEngine.renderFrame(timeline, playhead);
    set({ currentFrame: frame });
  },

  setMaxLEDs: (count: number) => {
    const state = get();
    const newEngine = new RenderingEngine(count, state.hardwareModel);
    const newRegistry = newEngine.getPresetRegistry();
    registerDefaultPresets(newRegistry);
    set({ maxLEDs: count, renderingEngine: newEngine, presetRegistry: newRegistry });
    state.render();
  },

  setFPS: (fps: number) => {
    set({ fps });
  },
}));


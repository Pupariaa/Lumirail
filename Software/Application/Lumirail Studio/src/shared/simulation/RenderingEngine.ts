import {
  Timeline,
  Clip,
  SimulationTime,
  TimelineTime,
  ResolvedFrame,
  Intention,
} from './types';
import { TimeMapper } from './TimeMapper';
import { IntentionResolver } from './IntentionResolver';
import { PresetRegistry } from './PresetRegistry';
import { HardwareModel } from './hardware/HardwareModel';

export class RenderingEngine {
  private timeMapper: TimeMapper;
  private intentionResolver: IntentionResolver;
  private presetRegistry: PresetRegistry;

  constructor(maxLEDs: number = 1000, hardwareModel: HardwareModel | null = null) {
    this.timeMapper = new TimeMapper(600);
    this.intentionResolver = new IntentionResolver(maxLEDs, hardwareModel);
    this.presetRegistry = new PresetRegistry();
  }

  setHardwareModel(hardwareModel: HardwareModel): void {
    this.intentionResolver.setHardwareModel(hardwareModel);
  }

  renderFrame(timeline: Timeline, timelineTime: TimelineTime): ResolvedFrame {
    const simulationTime = this.timeMapper.timelineToSimulation(timelineTime);
    const activeClips = this.getActiveClips(timeline, timelineTime);
    const intentions = this.generateIntentions(activeClips, simulationTime);
    const ledFrame = this.intentionResolver.resolve(intentions);

    return {
      timestamp: timelineTime,
      simulationTime,
      ledFrame,
    };
  }

  setTimelineDuration(duration: TimelineTime): void {
    this.timeMapper.setClipDuration(duration);
  }

  getPresetRegistry(): PresetRegistry {
    return this.presetRegistry;
  }

  private getActiveClips(timeline: Timeline, timelineTime: TimelineTime): Clip[] {
    return timeline.clips.filter(
      (clip) =>
        clip.enabled &&
        timelineTime >= clip.timeRange.start &&
        timelineTime <= clip.timeRange.end
    );
  }

  private generateIntentions(clips: Clip[], _simulationTime: SimulationTime): Intention[] {
    const intentions: Intention[] = [];

    for (const clip of clips) {
      const preset = this.presetRegistry.getPreset(clip.presetId);
      if (!preset) continue;

      const clipIntentions = preset.generate(
        clip.presetParams,
        clip.randomSeed || 0
      );

      for (const intention of clipIntentions) {
        intentions.push({
          ...intention,
          target: clip.target,
          priority: clip.priority,
          blendMode: clip.blendMode,
        });
      }
    }

    return intentions;
  }
}


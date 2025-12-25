import { TimelineTime, SimulationTime, SIMULATION_CYCLE_HOURS } from './types';

export class TimeMapper {
  private clipDuration: number;

  constructor(clipDuration: number) {
    this.clipDuration = clipDuration;
  }

  timelineToSimulation(timelineTime: TimelineTime): SimulationTime {
    const ratio = timelineTime / this.clipDuration;
    return (ratio * SIMULATION_CYCLE_HOURS * 3600) % (SIMULATION_CYCLE_HOURS * 3600);
  }

  simulationToTimeline(simulationTime: SimulationTime): TimelineTime {
    const ratio = simulationTime / (SIMULATION_CYCLE_HOURS * 3600);
    return ratio * this.clipDuration;
  }

  setClipDuration(duration: number): void {
    this.clipDuration = duration;
  }

  getClipDuration(): number {
    return this.clipDuration;
  }
}


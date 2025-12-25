import { Timeline, Clip, TimelineTime } from './types';

export class TimelineModel {
  private timeline: Timeline;

  constructor(initialDuration: TimelineTime = 600) {
    this.timeline = {
      clips: [],
      duration: initialDuration,
      playhead: 0,
      playing: false,
    };
  }

  getTimeline(): Timeline {
    return this.timeline;
  }

  setDuration(duration: TimelineTime): void {
    this.timeline.duration = duration;
    this.clampPlayhead();
  }

  getDuration(): TimelineTime {
    return this.timeline.duration;
  }

  setPlayhead(time: TimelineTime): void {
    this.timeline.playhead = Math.max(0, Math.min(time, this.timeline.duration));
  }

  getPlayhead(): TimelineTime {
    return this.timeline.playhead;
  }

  setPlaying(playing: boolean): void {
    this.timeline.playing = playing;
  }

  isPlaying(): boolean {
    return this.timeline.playing;
  }

  addClip(clip: Clip): void {
    this.timeline.clips.push(clip);
  }

  removeClip(clipId: string): void {
    this.timeline.clips = this.timeline.clips.filter((c) => c.id !== clipId);
  }

  updateClip(clipId: string, updates: Partial<Clip>): void {
    const clip = this.timeline.clips.find((c) => c.id === clipId);
    if (clip) {
      Object.assign(clip, updates);
    }
  }

  getClip(clipId: string): Clip | undefined {
    return this.timeline.clips.find((c) => c.id === clipId);
  }

  getAllClips(): Clip[] {
    return [...this.timeline.clips];
  }

  getClipsAtTime(time: TimelineTime): Clip[] {
    return this.timeline.clips.filter(
      (clip) =>
        clip.enabled &&
        time >= clip.timeRange.start &&
        time <= clip.timeRange.end
    );
  }

  moveClip(clipId: string, newStart: TimelineTime): void {
    const clip = this.timeline.clips.find((c) => c.id === clipId);
    if (clip) {
      const duration = clip.timeRange.end - clip.timeRange.start;
      clip.timeRange.start = Math.max(0, newStart);
      clip.timeRange.end = Math.min(this.timeline.duration, clip.timeRange.start + duration);
    }
  }

  resizeClip(clipId: string, newEnd: TimelineTime): void {
    const clip = this.timeline.clips.find((c) => c.id === clipId);
    if (clip) {
      clip.timeRange.end = Math.max(
        clip.timeRange.start,
        Math.min(this.timeline.duration, newEnd)
      );
    }
  }

  private clampPlayhead(): void {
    if (this.timeline.playhead > this.timeline.duration) {
      this.timeline.playhead = this.timeline.duration;
    }
  }
}


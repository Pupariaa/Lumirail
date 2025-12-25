import React from 'react';
import { useSimulationStore } from '../store/useSimulationStore';
import { TimelineTime } from '../../shared/simulation/types';

export const TimelineView: React.FC = () => {
  const timeline = useSimulationStore((state) => state.timelineModel.getTimeline());
  const setPlayhead = useSimulationStore((state) => state.setPlayhead);
  const play = useSimulationStore((state) => state.play);
  const pause = useSimulationStore((state) => state.pause);
  const stop = useSimulationStore((state) => state.stop);
  const isPlaying = timeline.playing;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = x / rect.width;
    const newTime = ratio * timeline.duration;
    setPlayhead(newTime);
  };

  const formatTime = (time: TimelineTime): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <section className="panel timeline-view">
      <h2 className="panel-title">Timeline</h2>
      <div className="timeline-controls">
        <button onClick={isPlaying ? pause : play} className="button primary">
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button onClick={stop} className="button secondary">
          Stop
        </button>
        <span className="timeline-time">
          {formatTime(timeline.playhead)} / {formatTime(timeline.duration)}
        </span>
      </div>
      <div className="timeline-ruler" onClick={handleTimelineClick}>
        <div
          className="timeline-playhead"
          style={{ left: `${(timeline.playhead / timeline.duration) * 100}%` }}
        />
        {timeline.clips.map((clip) => (
          <div
            key={clip.id}
            className="timeline-clip"
            style={{
              left: `${(clip.timeRange.start / timeline.duration) * 100}%`,
              width: `${((clip.timeRange.end - clip.timeRange.start) / timeline.duration) * 100}%`,
            }}
          >
            {clip.name}
          </div>
        ))}
      </div>
    </section>
  );
};


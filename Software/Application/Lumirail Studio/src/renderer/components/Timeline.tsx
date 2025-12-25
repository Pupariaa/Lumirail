import React, { useRef, useState, useCallback } from 'react';
import { useSimulationStore } from '../store/useSimulationStore';
import { Clip } from '../../shared/simulation/types';
import { TimeMapper } from '../../shared/simulation/TimeMapper';

export const Timeline: React.FC = () => {
  const playhead = useSimulationStore((state) => state.timelineModel.getPlayhead());
  const duration = useSimulationStore((state) => state.timelineModel.getDuration());
  const clips = useSimulationStore((state) => state.timelineModel.getAllClips());
  const playing = useSimulationStore((state) => state.timelineModel.isPlaying());
  const setPlayhead = useSimulationStore((state) => state.setPlayhead);
  const play = useSimulationStore((state) => state.play);
  const pause = useSimulationStore((state) => state.pause);
  const stop = useSimulationStore((state) => state.stop);
  const updateClip = useSimulationStore((state) => state.updateClip);
  const [zoom, setZoom] = useState(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyWidth, setBodyWidth] = useState(800);
  const [draggingClip, setDraggingClip] = useState<{ clipId: string; offsetX: number } | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [draggingPlayhead, setDraggingPlayhead] = useState(false);

  const rulerHeight = 35;
  const trackHeight = 50;
  const headerWidth = 150;
  
  // Calculate base pixels per second to fit timeline in viewport at zoom 1
  React.useEffect(() => {
    const updateWidth = () => {
      if (bodyRef.current) {
        setBodyWidth(bodyRef.current.clientWidth);
      }
    };
    
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const availableWidth = bodyWidth > 0 ? bodyWidth - headerWidth : 800;
  const basePixelsPerSecond = duration > 0 
    ? availableWidth / duration 
    : 50;
  const pixelsPerSecond = basePixelsPerSecond * zoom;
  const timelineWidth = duration * pixelsPerSecond;
  const actualWidth = Math.max(availableWidth, timelineWidth);
  
  // Calculate smart time step for ruler marks
  const getTimeStep = (): number => {
    const visibleDuration = availableWidth / pixelsPerSecond;
    if (visibleDuration <= 10) return 1;
    if (visibleDuration <= 30) return 5;
    if (visibleDuration <= 60) return 10;
    if (visibleDuration <= 300) return 30;
    if (visibleDuration <= 600) return 60;
    if (visibleDuration <= 3600) return 300;
    return 600;
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${minutes}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const formatSimulationTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate simulation time from timeline time
  const getSimulationTime = (timelineTime: number): number => {
    const timeMapper = new TimeMapper(duration);
    return timeMapper.timelineToSimulation(timelineTime);
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingClip) return;
    
    if (!bodyRef.current) return;
    
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const scrollLeft = bodyRef.current.scrollLeft;
    const clickX = e.clientX - rect.left + scrollLeft;
    const time = clickX / pixelsPerSecond;
    const clampedTime = Math.max(0, Math.min(time, duration));
    
    setPlayhead(clampedTime);
  };

  const handleClipMouseDown = (e: React.MouseEvent, clip: Clip) => {
    e.stopPropagation();
    setSelectedClipId(clip.id);
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    setDraggingClip({ clipId: clip.id, offsetX });
  };

  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingPlayhead(true);
    handlePlayheadMove(e.nativeEvent);
  };

  const scrubberRef = useRef<HTMLDivElement>(null);

  const handlePlayheadMove = React.useCallback((e: MouseEvent) => {
    if (!bodyRef.current) return;
    
    const clientX = e.clientX;
    const bodyRect = bodyRef.current.getBoundingClientRect();
    const scrollLeft = bodyRef.current.scrollLeft;
    const clickX = clientX - bodyRect.left + scrollLeft;
    
    const availableWidth = bodyWidth > 0 ? bodyWidth - headerWidth : 800;
    const currentDuration = duration;
    const basePixelsPerSecond = currentDuration > 0 
      ? availableWidth / currentDuration 
      : 50;
    const currentPixelsPerSecond = basePixelsPerSecond * zoom;
    
    const time = clickX / currentPixelsPerSecond;
    const clampedTime = Math.max(0, Math.min(time, currentDuration));
    setPlayhead(clampedTime);
  }, [bodyWidth, headerWidth, duration, zoom, setPlayhead]);

  const handlePlayheadMouseUp = useCallback(() => {
    setDraggingPlayhead(false);
  }, []);

  React.useEffect(() => {
    if (!draggingPlayhead) return;
    
    const handleMove = (e: MouseEvent) => {
      handlePlayheadMove(e);
    };
    
    document.addEventListener('mousemove', handleMove, { passive: false });
    document.addEventListener('mouseup', handlePlayheadMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handlePlayheadMouseUp);
    };
  }, [draggingPlayhead, handlePlayheadMouseUp, handlePlayheadMove]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!draggingClip || !bodyRef.current) return;
    const rect = bodyRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + bodyRef.current.scrollLeft - headerWidth;
    const time = (x - draggingClip.offsetX) / pixelsPerSecond;
    const clip = clips.find((c) => c.id === draggingClip.clipId);
    if (clip) {
      const clipDuration = clip.timeRange.end - clip.timeRange.start;
      const currentDuration = duration;
      const newStart = Math.max(0, Math.min(time, currentDuration - clipDuration));
      updateClip(clip.id, {
        timeRange: {
          start: newStart,
          end: newStart + clipDuration,
        },
      });
    }
  }, [draggingClip, clips, duration, pixelsPerSecond, updateClip]);

  const handleMouseUp = useCallback(() => {
    setDraggingClip(null);
  }, []);

  React.useEffect(() => {
    if (draggingClip) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
    return undefined;
  }, [draggingClip, handleMouseMove, handleMouseUp]);

  const organizeClipsIntoTracks = (clips: Clip[]): { name: string; clips: Clip[] }[] => {
    const tracks: { name: string; clips: Clip[] }[] = [];
    
    clips.forEach((clip) => {
      let trackIndex = -1;
      for (let i = 0; i < tracks.length; i++) {
        const canPlace = !tracks[i].clips.some((existingClip) => {
          return (
            clip.timeRange.start < existingClip.timeRange.end &&
            clip.timeRange.end > existingClip.timeRange.start
          );
        });
        if (canPlace) {
          trackIndex = i;
          break;
        }
      }
      if (trackIndex === -1) {
        tracks.push({ name: `Track ${tracks.length + 1}`, clips: [clip] });
      } else {
        tracks[trackIndex].clips.push(clip);
      }
    });

    if (tracks.length === 0) {
      tracks.push({ name: 'Track 1', clips: [] });
    }
    
    return tracks;
  };

  const tracks = organizeClipsIntoTracks(clips);

  return (
    <div className="timeline-container">
      <div className="timeline-controls-bar">
        <div className="timeline-controls-left">
          <button
            onClick={playing ? pause : play}
            className="button button-icon"
            title={playing ? 'Pause' : 'Play'}
          >
            {playing ? '⏸' : '▶'}
          </button>
          <button onClick={stop} className="button button-icon" title="Stop">
            ⏹
          </button>
          <div className="timeline-time-displays">
            <div className="timeline-time-real">
              <span className="time-label">Real Time</span>
              <span className="time-value">{formatTime(playhead)} / {formatTime(duration)}</span>
            </div>
            <div className="timeline-time-sim">
              <span className="time-label">Sim Time</span>
              <span className="time-value">{formatSimulationTime(getSimulationTime(playhead))}</span>
            </div>
          </div>
        </div>
        <div className="timeline-controls-right">
          <button
            onClick={() => setZoom(Math.max(0.25, zoom - 0.25))}
            className="button button-icon"
            title="Zoom out"
          >
            −
          </button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom(Math.min(4, zoom + 0.25))}
            className="button button-icon"
            title="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      <div className="timeline-content">
        <div 
          ref={scrubberRef}
          className="timeline-scrubber" 
          style={{ height: rulerHeight }}
          onMouseDown={handlePlayheadMouseDown}
        />
        <div className="timeline-header-body-wrapper">
          <div className="timeline-header" style={{ width: headerWidth }}>
            <div className="timeline-header-cell" style={{ height: rulerHeight }}>Time</div>
            {tracks.map((track, idx) => (
              <div
                key={idx}
                className="timeline-header-cell"
                style={{ height: trackHeight }}
              >
                {track.name}
              </div>
            ))}
          </div>

          <div 
            className="timeline-body" 
            ref={bodyRef}
          >
            <div
              className="timeline-playhead"
              style={{
                left: playhead * pixelsPerSecond,
              }}
            />
          <div
            className="timeline-ruler"
            onClick={handleTimelineClick}
            style={{
              height: rulerHeight,
              width: actualWidth,
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            {(() => {
              const timeStep = getTimeStep();
              const marks = [];
              for (let time = 0; time <= duration; time += timeStep) {
                const left = time * pixelsPerSecond;
                let label = '';
                if (timeStep < 60) {
                  label = `${Math.floor(time)}s`;
                } else if (timeStep < 3600) {
                  const mins = Math.floor(time / 60);
                  const secs = Math.floor(time % 60);
                  label = secs === 0 ? `${mins}:00` : `${mins}:${secs.toString().padStart(2, '0')}`;
                } else {
                  const hours = Math.floor(time / 3600);
                  const mins = Math.floor((time % 3600) / 60);
                  label = mins === 0 ? `${hours}:00:00` : `${hours}:${mins.toString().padStart(2, '0')}:00`;
                }
                
                marks.push(
                  <div
                    key={time}
                    className="timeline-ruler-mark"
                    style={{ left }}
                  >
                    <div className="timeline-ruler-line" />
                    <div className="timeline-ruler-label">{label}</div>
                  </div>
                );
              }
              return marks;
            })()}
          </div>

          <div
            className="timeline-tracks-container"
            onClick={handleTimelineClick}
            style={{
              width: actualWidth,
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            {tracks.map((track, trackIdx) => (
              <div
                key={trackIdx}
                className="timeline-track"
                style={{
                  height: trackHeight,
                  width: actualWidth,
                }}
              >
                {track.clips.map((clip) => {
                  const left = clip.timeRange.start * pixelsPerSecond;
                  const width = (clip.timeRange.end - clip.timeRange.start) * pixelsPerSecond;
                  return (
                    <div
                      key={clip.id}
                      className={`timeline-clip ${selectedClipId === clip.id ? 'selected' : ''}`}
                      style={{
                        left,
                        width: Math.max(width, 20),
                        height: trackHeight - 8,
                        top: 4,
                      }}
                      onMouseDown={(e) => handleClipMouseDown(e, clip)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="timeline-clip-label">{clip.name}</div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

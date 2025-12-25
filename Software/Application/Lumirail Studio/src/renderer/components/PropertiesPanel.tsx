import React from 'react';
import { useSimulationStore } from '../store/useSimulationStore';

export const PropertiesPanel: React.FC = () => {
  const timeline = useSimulationStore((state) => state.timelineModel.getTimeline());
  const updateClip = useSimulationStore((state) => state.updateClip);
  const [selectedClipId] = React.useState<string | null>(null);

  const selectedClip = selectedClipId
    ? timeline.clips.find((c) => c.id === selectedClipId)
    : null;

  if (!selectedClip) {
    return (
      <div className="properties-panel">
        <div className="properties-empty">
          Select a clip to edit properties
        </div>
      </div>
    );
  }

  return (
    <div className="properties-panel">
      <h3 className="properties-title">Properties</h3>
      <div className="properties-content">
        <div className="property-group">
          <label className="property-label">Name</label>
          <input
            type="text"
            className="property-input"
            value={selectedClip.name}
            onChange={(e) => updateClip(selectedClip.id, { name: e.target.value })}
          />
        </div>
        <div className="property-group">
          <label className="property-label">Start Time</label>
          <input
            type="number"
            className="property-input"
            value={selectedClip.timeRange.start.toFixed(2)}
            onChange={(e) => {
              const start = parseFloat(e.target.value);
              if (!isNaN(start)) {
                const duration = selectedClip.timeRange.end - selectedClip.timeRange.start;
                updateClip(selectedClip.id, {
                  timeRange: {
                    start: Math.max(0, start),
                    end: Math.max(0, start) + duration,
                  },
                });
              }
            }}
          />
        </div>
        <div className="property-group">
          <label className="property-label">End Time</label>
          <input
            type="number"
            className="property-input"
            value={selectedClip.timeRange.end.toFixed(2)}
            onChange={(e) => {
              const end = parseFloat(e.target.value);
              if (!isNaN(end)) {
                updateClip(selectedClip.id, {
                  timeRange: {
                    start: selectedClip.timeRange.start,
                    end: Math.max(selectedClip.timeRange.start, end),
                  },
                });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};


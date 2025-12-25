import React, { useState } from 'react';
import { useSimulationStore } from '../store/useSimulationStore';
import { Clip, BlendMode } from '../../shared/simulation/types';

export const Sidebar: React.FC = () => {
  const presetRegistry = useSimulationStore((state) => state.presetRegistry);
  const addClip = useSimulationStore((state) => state.addClip);
  const timeline = useSimulationStore((state) => state.timelineModel.getTimeline());
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const presets = presetRegistry.getAllPresets();

  const handlePresetDoubleClick = (presetId: string) => {
    const preset = presetRegistry.getPreset(presetId);
    if (!preset) return;

    const newClip: Clip = {
      id: `clip-${Date.now()}`,
      name: preset.name,
      presetId: preset.id,
      presetParams: {},
      timeRange: {
        start: timeline.playhead,
        end: timeline.playhead + 10,
      },
      target: { type: 'group' },
      priority: 10,
      blendMode: BlendMode.Max,
      enabled: true,
    };

    addClip(newClip);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <h3 className="sidebar-title">Presets</h3>
        <div className="preset-list">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className={`preset-item ${selectedPreset === preset.id ? 'selected' : ''}`}
              onClick={() => setSelectedPreset(preset.id)}
              onDoubleClick={() => handlePresetDoubleClick(preset.id)}
            >
              <div className="preset-name">{preset.name}</div>
              <div className="preset-description">{preset.description}</div>
              <div className="preset-category">{preset.category}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


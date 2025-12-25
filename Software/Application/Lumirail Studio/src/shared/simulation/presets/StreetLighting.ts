import { InfrastructurePreset, Intention } from '../types';

export function createStreetLightingPreset(): InfrastructurePreset {
  return {
    id: 'street-lighting',
    name: 'Street Lighting',
    description: 'Public street lighting with day/night cycle',
    category: 'Public',
    parameters: [
      {
        id: 'intensity',
        label: 'Intensity',
        type: 'slider',
        min: 0,
        max: 255,
        defaultValue: 200,
        step: 1,
      },
      {
        id: 'turnOnHour',
        label: 'Turn On Hour',
        type: 'slider',
        min: 17,
        max: 23,
        defaultValue: 19,
        step: 1,
      },
      {
        id: 'turnOffHour',
        label: 'Turn Off Hour',
        type: 'slider',
        min: 0,
        max: 8,
        defaultValue: 6,
        step: 1,
      },
    ],
    zones: ['lamp'],
    generate: (_params, seed) => {
      const intention: Intention = {
        id: `street-lighting-${seed}`,
        priority: 10,
        blendMode: 'max' as any,
        target: { type: 'group' },
        enabled: true,
      };

      return [intention];
    },
  };
}


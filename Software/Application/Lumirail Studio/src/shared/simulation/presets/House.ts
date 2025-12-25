import { InfrastructurePreset, Intention } from '../types';

export function createHousePreset(): InfrastructurePreset {
  return {
    id: 'house',
    name: 'House',
    description: 'Individual house with rooms and occupancy simulation',
    category: 'Residential',
    parameters: [
      {
        id: 'size',
        label: 'Size',
        type: 'slider',
        min: 1,
        max: 5,
        defaultValue: 2,
        step: 1,
      },
      {
        id: 'occupancy',
        label: 'Occupancy Level',
        type: 'slider',
        min: 0,
        max: 100,
        defaultValue: 70,
        step: 1,
      },
    ],
    zones: ['room1', 'room2', 'room3', 'window1', 'window2'],
    generate: (_params, seed) => {
      const intention: Intention = {
        id: `house-${seed}`,
        priority: 20,
        blendMode: 'overwrite' as any,
        target: { type: 'group' },
        enabled: true,
      };

      return [intention];
    },
  };
}


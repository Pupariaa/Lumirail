import { createStreetLightingPreset } from './StreetLighting';
import { createHousePreset } from './House';
import { PresetRegistry } from '../PresetRegistry';

export function registerDefaultPresets(registry: PresetRegistry): void {
  registry.registerPreset(createStreetLightingPreset());
  registry.registerPreset(createHousePreset());
}


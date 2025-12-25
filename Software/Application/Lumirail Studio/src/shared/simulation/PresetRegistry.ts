import { InfrastructurePreset } from './types';

export class PresetRegistry {
  private presets: Map<string, InfrastructurePreset> = new Map();

  registerPreset(preset: InfrastructurePreset): void {
    this.presets.set(preset.id, preset);
  }

  getPreset(id: string): InfrastructurePreset | undefined {
    return this.presets.get(id);
  }

  getAllPresets(): InfrastructurePreset[] {
    return Array.from(this.presets.values());
  }

  getPresetsByCategory(category: string): InfrastructurePreset[] {
    return this.getAllPresets().filter((p) => p.category === category);
  }
}


import {
  Intention,
  IntentionResult,
  BlendMode,
  LEDId,
  LEDFrame,
  Target,
} from './types';
import { HardwareModel } from './hardware/HardwareModel';

export class IntentionResolver {
  private maxLEDs: number;
  private hardwareModel: HardwareModel | null;

  constructor(maxLEDs: number = 1000, hardwareModel: HardwareModel | null = null) {
    this.maxLEDs = maxLEDs;
    this.hardwareModel = hardwareModel;
  }

  setHardwareModel(hardwareModel: HardwareModel): void {
    this.hardwareModel = hardwareModel;
  }

  resolve(intentions: Intention[]): LEDFrame {
    const frame = new Uint8Array(this.maxLEDs);
    const results = new Map<LEDId, IntentionResult[]>();

    for (const intention of intentions) {
      if (!intention.enabled) continue;

      const ledIds = this.getLEDIdsFromTarget(intention.target);
      for (const ledId of ledIds) {
        if (ledId >= this.maxLEDs) continue;

        const baseValue = this.evaluateIntention(intention, ledId);
        const modulatedValue = this.applyModulations(baseValue, intention);

        if (!results.has(ledId)) {
          results.set(ledId, []);
        }

        results.get(ledId)!.push({
          ledId,
          value: modulatedValue,
          priority: intention.priority,
          blendMode: intention.blendMode,
        });
      }
    }

    for (const [ledId, ledIntentions] of results) {
      frame[ledId] = this.composeValues(ledIntentions);
    }

    return frame;
  }

  private getLEDIdsFromTarget(target: Target): LEDId[] {
    switch (target.type) {
      case 'singleLed':
        return target.ledId !== undefined ? [target.ledId] : [];
      case 'ledRange':
        if (target.ledStart === undefined || target.ledEnd === undefined) return [];
        const ids: LEDId[] = [];
        const start = Math.min(target.ledStart, target.ledEnd);
        const end = Math.max(target.ledStart, target.ledEnd);
        for (let i = start; i <= end; i++) {
          ids.push(i);
        }
        return ids;
      case 'module':
        if (!this.hardwareModel || target.id === undefined) return [];
        const moduleIndex = parseInt(target.id, 10);
        const module = this.hardwareModel.getModule(moduleIndex);
        if (!module) return [];
        const moduleIds: LEDId[] = [];
        for (let i = 0; i < module.channelCount; i++) {
          moduleIds.push(module.ledStartIndex + i);
        }
        return moduleIds;
      case 'group':
        return [];
      default:
        return [];
    }
  }

  private evaluateIntention(_intention: Intention, _ledId: LEDId): number {
    return 128;
  }

  private applyModulations(baseValue: number, intention: Intention): number {
    if (!intention.modulations) return baseValue;

    let value = baseValue;

    for (const mod of intention.modulations) {
      switch (mod.type) {
        case 'offset':
          value += mod.amount;
          break;
        case 'noise':
          const noise = this.seededRandom(mod.seed || 0) * mod.amount;
          value += noise - mod.amount / 2;
          break;
        case 'mask':
          value *= mod.amount;
          break;
      }
    }

    return Math.max(0, Math.min(255, Math.round(value)));
  }

  private composeValues(intentions: IntentionResult[]): number {
    if (intentions.length === 0) return 0;

    intentions.sort((a, b) => b.priority - a.priority);

    let result = intentions[0].value;

    for (let i = 1; i < intentions.length; i++) {
      const current = intentions[i];
      result = this.blend(result, current.value, current.blendMode);
    }

    return Math.max(0, Math.min(255, Math.round(result)));
  }

  private blend(a: number, b: number, mode: BlendMode): number {
    switch (mode) {
      case BlendMode.Overwrite:
        return b;
      case BlendMode.Max:
        return Math.max(a, b);
      case BlendMode.Add:
        return a + b;
      case BlendMode.Multiply:
        return (a * b) / 255;
      default:
        return b;
    }
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
}


import { LumirailNode, LMS_S1_G2, MODULE_CHANNEL_COUNT, DEFAULT_MODULE_COUNT } from './types';

export class HardwareModel {
  private node: LumirailNode;

  constructor() {
    this.node = this.createDefaultNode();
  }

  private createDefaultNode(): LumirailNode {
    const modules: LMS_S1_G2[] = [];
    
    for (let i = 0; i < DEFAULT_MODULE_COUNT; i++) {
      modules.push({
        id: `module-${i}`,
        moduleIndex: i,
        channelCount: MODULE_CHANNEL_COUNT,
        ledStartIndex: i * MODULE_CHANNEL_COUNT,
        connected: true,
      });
    }

    return {
      id: 'lumirail-node-0',
      name: 'Lumirail Node',
      connected: true,
      modules,
    };
  }

  getNode(): LumirailNode {
    return this.node;
  }

  getModuleCount(): number {
    return this.node.modules.length;
  }

  getTotalLEDCount(): number {
    return this.node.modules.reduce((total, module) => total + module.channelCount, 0);
  }

  getModule(moduleIndex: number): LMS_S1_G2 | undefined {
    return this.node.modules.find((m) => m.moduleIndex === moduleIndex);
  }

  getLEDModule(ledId: number): LMS_S1_G2 | undefined {
    return this.node.modules.find(
      (module) =>
        ledId >= module.ledStartIndex &&
        ledId < module.ledStartIndex + module.channelCount
    );
  }

  getLEDIndexInModule(ledId: number): number | null {
    const module = this.getLEDModule(ledId);
    if (!module) return null;
    return ledId - module.ledStartIndex;
  }

  setNodeConnected(connected: boolean): void {
    this.node.connected = connected;
  }

  setModuleConnected(moduleIndex: number, connected: boolean): void {
    const module = this.getModule(moduleIndex);
    if (module) {
      module.connected = connected;
    }
  }
}


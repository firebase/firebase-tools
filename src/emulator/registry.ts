import { Emulators, EmulatorInfo, EmulatorInstance } from "./types";

export class EmulatorRegistry {
  private static ALL = [Emulators.FUNCTIONS, Emulators.FIRESTORE, Emulators.DATABASE];

  private static INFO: Map<Emulators, EmulatorInfo> = new Map();

  static setInfo(emulator: Emulators, info: EmulatorInfo): void {
    this.INFO.set(emulator, info);
  }

  static clearInfo(emulator: Emulators): void {
    this.INFO.delete(emulator);
  }

  static isRunning(emulator: Emulators): boolean {
    const info = this.INFO.get(emulator);
    return info !== undefined;
  }

  static listRunning(): Emulators[] {
    const res: Emulators[] = [];
    for (const name of this.ALL) {
      if (this.isRunning(name)) {
        res.push(name);
      }
    }

    return res;
  }

  static getInstance(emulator: Emulators): EmulatorInstance | undefined {
    const info = this.INFO.get(emulator);
    if (!info) {
      return undefined;
    }

    return info.instance;
  }

  static getPort(emulator: Emulators): number {
    const info = this.INFO.get(emulator);
    if (!info) {
      return -1;
    }

    return info.port;
  }
}

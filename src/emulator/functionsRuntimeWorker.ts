import { FunctionsRuntimeInstance } from "./functionsEmulator";
import { EmulatorLog, waitForLog } from "./types";
import { FunctionsRuntimeBundle, FunctionsRuntimeArgs } from "./functionsEmulatorShared";

export enum RuntimeWorkerState {
  IDLE,
  BUSY,
  DONE,
}

export class RuntimeWorker {
  state: RuntimeWorkerState;
  triggerId: string;
  runtime: FunctionsRuntimeInstance;

  constructor(triggerId: string, runtime: FunctionsRuntimeInstance) {
    this.state = RuntimeWorkerState.IDLE;
    this.triggerId = triggerId;
    this.runtime = runtime;

    this.runtime.events.on("log", (log: EmulatorLog) => {
      if (log.type === "runtime-status") {
        if (log.data.state === "idle") {
          this.state = RuntimeWorkerState.IDLE;
        }
      }
    });

    this.runtime.exit.then(() => {
      this.state = RuntimeWorkerState.DONE;
    });
  }

  async execute(frb: FunctionsRuntimeBundle, serializedTriggers?: string) {
    this.state = RuntimeWorkerState.BUSY;
    const args: FunctionsRuntimeArgs = { frb, serializedTriggers };
    this.runtime.send(args);
  }

  waitForIdleOrExit(): Promise<any> {
    if (this.state === RuntimeWorkerState.IDLE) {
      return Promise.resolve();
    }

    return new Promise((res) => {
      // Idle event (via log)
      waitForLog(this.runtime.events, "SYSTEM", "runtime-status", (log: EmulatorLog) => {
        return log.data.state === "idle";
      }).then(res);

      // Exit event (via process)
      this.runtime.exit.then(res);
    });
  }
}

export class RuntimeWorkerPool {
  workers: { [triggerId: string]: Array<RuntimeWorker> } = {};

  getIdleWorker(triggerId: string | undefined): RuntimeWorker | undefined {
    this.clearDoneWorkers();

    const key = this.getTriggerKey(triggerId);
    if (!this.workers[key]) {
      this.workers[key] = [];
      return undefined;
    }

    for (const worker of this.workers[key]) {
      if (worker.state === RuntimeWorkerState.IDLE) {
        return worker;
      }
    }

    return undefined;
  }

  addWorker(triggerId: string | undefined, runtime: FunctionsRuntimeInstance): RuntimeWorker {
    const key = this.getTriggerKey(triggerId);
    const worker = new RuntimeWorker(key, runtime);

    if (this.workers[key]) {
      this.workers[key].push(worker);
    } else {
      this.workers[key] = [worker];
    }

    return worker;
  }

  private getTriggerKey(triggerId?: string) {
    return triggerId || "__diagnostic__";
  }

  private clearDoneWorkers() {
    Object.keys(this.workers).forEach((key: string) => {
      const keyWorkers = this.workers[key];

      // For each done worker, detach any event listeners.
      for (const w of keyWorkers) {
        if (w.state === RuntimeWorkerState.DONE) {
          w.runtime.events.removeAllListeners();
        }
      }

      // Drop all 'DONE" workers from the pool
      const notDoneWorkers = keyWorkers.filter((worker) => {
        return worker.state !== RuntimeWorkerState.DONE;
      });
      this.workers[key] = notDoneWorkers;
    });
  }
}

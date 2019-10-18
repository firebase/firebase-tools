import { FunctionsRuntimeInstance } from "./functionsEmulator";
import { EmulatorLog } from "./types";
import { FunctionsRuntimeBundle, FunctionsRuntimeArgs } from "./functionsEmulatorShared";
import { EventEmitter } from "events";
import { list } from "tar";

type LogListener = (el: EmulatorLog) => any;

enum RuntimeWorkerState {
  IDLE = "IDLE",
  BUSY = "BUSY",
  FINISHED = "FINISHED",
}

export class RuntimeWorker {
  readonly triggerId: string;
  readonly runtime: FunctionsRuntimeInstance;

  private logListeners: Array<LogListener> = [];
  private stateEvents: EventEmitter = new EventEmitter();
  private _state: RuntimeWorkerState = RuntimeWorkerState.IDLE;

  constructor(triggerId: string, runtime: FunctionsRuntimeInstance) {
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
      this.state = RuntimeWorkerState.FINISHED;
    });
  }

  async execute(frb: FunctionsRuntimeBundle, serializedTriggers?: string) {
    this.state = RuntimeWorkerState.BUSY;
    const args: FunctionsRuntimeArgs = { frb, serializedTriggers };
    this.runtime.send(args);
  }

  get state(): RuntimeWorkerState {
    return this._state;
  }

  set state(state: RuntimeWorkerState) {
    if (state === RuntimeWorkerState.IDLE) {
      // Remove all of the log listeners every time we move to IDLE
      for (const l of this.logListeners) {
        this.runtime.events.removeListener("log", l);
      }
      this.logListeners = [];
    }

    this._state = state;
    this.stateEvents.emit(this._state);
  }

  onLogs(listener: LogListener, forever: boolean = false) {
    if (!forever) {
      this.logListeners.push(listener);
    }

    this.runtime.events.on("log", listener);
  }

  waitForNotBusy(): Promise<any> {
    if (this.state !== RuntimeWorkerState.BUSY) {
      return Promise.resolve();
    }

    return new Promise((res) => {
      // Finish on either IDLE or FINISHED states
      this.stateEvents.once(RuntimeWorkerState.IDLE, res);
      this.stateEvents.once(RuntimeWorkerState.FINISHED, res);
    });
  }

  waitForSystemLog(filter: (el: EmulatorLog) => boolean): Promise<EmulatorLog> {
    return EmulatorLog.waitForLog(this.runtime.events, "SYSTEM", "runtime-status", filter);
  }
}

export class RuntimeWorkerPool {
  workers: { [triggerId: string]: Array<RuntimeWorker> } = {};

  getIdleWorker(triggerId: string | undefined): RuntimeWorker | undefined {
    this.cleanUpWorkers();

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

  private cleanUpWorkers() {
    Object.keys(this.workers).forEach((key: string) => {
      const keyWorkers = this.workers[key];

      // For each finished worker, detach any event listeners.
      for (const w of keyWorkers) {
        if (w.state === RuntimeWorkerState.FINISHED) {
          w.runtime.events.removeAllListeners();
        }
      }

      // Drop all finished workers from the pool
      const notDoneWorkers = keyWorkers.filter((worker) => {
        return worker.state !== RuntimeWorkerState.FINISHED;
      });
      this.workers[key] = notDoneWorkers;
    });
  }
}

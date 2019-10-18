import * as uuid from "uuid";
import { FunctionsRuntimeInstance } from "./functionsEmulator";
import { EmulatorLog } from "./types";
import { FunctionsRuntimeBundle, FunctionsRuntimeArgs } from "./functionsEmulatorShared";
import { EventEmitter } from "events";
import { EmulatorLogger } from "./emulatorLogger";

type LogListener = (el: EmulatorLog) => any;

export enum RuntimeWorkerState {
  // Worker is ready to accept new work
  IDLE = "IDLE",

  // Worker is currently doing work
  BUSY = "BUSY",

  // Worker is BUSY and when done will be killed rather
  // than recycled.
  FINISHING = "FINISHING",

  // Worker has exited and cannot be re-used
  FINISHED = "FINISHED",
}

export class RuntimeWorker {
  readonly id: string;
  readonly triggerId: string;
  readonly runtime: FunctionsRuntimeInstance;

  stateEvents: EventEmitter = new EventEmitter();

  private logListeners: Array<LogListener> = [];
  private _state: RuntimeWorkerState = RuntimeWorkerState.IDLE;

  constructor(triggerId: string, runtime: FunctionsRuntimeInstance) {
    this.id = uuid.v4();
    this.triggerId = triggerId;
    this.runtime = runtime;

    this.runtime.events.on("log", (log: EmulatorLog) => {
      if (log.type === "runtime-status") {
        if (log.data.state === "idle") {
          if (this.state === RuntimeWorkerState.BUSY) {
            this.state = RuntimeWorkerState.IDLE;
          } else if (this.state === RuntimeWorkerState.FINISHING) {
            this.log(`IDLE --> FINISHING`);
            this.runtime.shutdown();
          }
        }
      }
    });

    this.runtime.exit.then(() => {
      this.log("exited");
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
      // Remove all temporary log listeners every time we move to IDLE
      for (const l of this.logListeners) {
        this.runtime.events.removeListener("log", l);
      }
      this.logListeners = [];
    }

    if (state === RuntimeWorkerState.FINISHED) {
      this.runtime.events.removeAllListeners();
    }

    this.log(state);
    this._state = state;
    this.stateEvents.emit(this._state);
  }

  onLogs(listener: LogListener, forever: boolean = false) {
    if (!forever) {
      this.logListeners.push(listener);
    }

    this.runtime.events.on("log", listener);
  }

  waitForDone(): Promise<any> {
    if (this.state === RuntimeWorkerState.IDLE || this.state === RuntimeWorkerState.FINISHED) {
      return Promise.resolve();
    }

    return new Promise((res) => {
      const listener = () => {
        this.stateEvents.removeListener(RuntimeWorkerState.IDLE, listener);
        this.stateEvents.removeListener(RuntimeWorkerState.FINISHED, listener);
        res();
      };

      // Finish on either IDLE or FINISHED states
      this.stateEvents.once(RuntimeWorkerState.IDLE, listener);
      this.stateEvents.once(RuntimeWorkerState.FINISHED, listener);
    });
  }

  waitForSystemLog(filter: (el: EmulatorLog) => boolean): Promise<EmulatorLog> {
    return EmulatorLog.waitForLog(this.runtime.events, "SYSTEM", "runtime-status", filter);
  }

  private log(msg: string): void {
    EmulatorLogger.log("DEBUG", `[worker-${this.triggerId}-${this.id}]: ${msg}`);
  }
}

export class RuntimeWorkerPool {
  workers: { [triggerId: string]: Array<RuntimeWorker> } = {};

  /**
   * When code changes (or in some other rare circumstances) we need to get
   * a new pool of workers. For each IDLE worker we kill it immediately. For
   * each BUSY worker we move it to the FINISHING state so that it will
   * kill itself after the next run.
   */
  refresh() {
    Object.values(this.workers).forEach((arr) => {
      arr.forEach((w) => {
        if (w.state === RuntimeWorkerState.IDLE) {
          this.log(`Shutting down IDLE worker (${w.triggerId})`);
          w.runtime.shutdown();
        } else if (w.state === RuntimeWorkerState.BUSY) {
          this.log(`Marking BUSY worker to finish (${w.triggerId})`);
          w.state = RuntimeWorkerState.FINISHING;
        }
      });
    });
  }

  /**
   * Immediately kill all workers.
   */
  exit() {
    Object.values(this.workers).forEach((arr) => {
      arr.forEach((w) => {
        if (w.state === RuntimeWorkerState.IDLE) {
          w.runtime.shutdown();
        } else {
          w.runtime.kill();
        }
      });
    });
  }

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
    return triggerId || "~diagnostic~";
  }

  private cleanUpWorkers() {
    Object.keys(this.workers).forEach((key: string) => {
      const keyWorkers = this.workers[key];

      // Drop all finished workers from the pool
      const notDoneWorkers = keyWorkers.filter((worker) => {
        return worker.state !== RuntimeWorkerState.FINISHED;
      });
      this.workers[key] = notDoneWorkers;
    });
  }

  private log(msg: string): void {
    EmulatorLogger.log("DEBUG", `[worker-pool]: ${msg}`);
  }
}

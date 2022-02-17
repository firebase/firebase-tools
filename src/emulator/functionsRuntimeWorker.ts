import * as uuid from "uuid";
import { FunctionsRuntimeInstance, InvokeRuntimeOpts } from "./functionsEmulator";
import { EmulatorLog, Emulators, FunctionsExecutionMode } from "./types";
import {
  FunctionsRuntimeArgs,
  FunctionsRuntimeBundle,
  getTemporarySocketPath,
} from "./functionsEmulatorShared";
import { EventEmitter } from "events";
import { EmulatorLogger, ExtensionLogInfo } from "./emulatorLogger";
import { FirebaseError } from "../error";

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
  readonly key: string;
  readonly runtime: FunctionsRuntimeInstance;

  lastArgs?: FunctionsRuntimeArgs;
  stateEvents: EventEmitter = new EventEmitter();

  private socketReady?: Promise<any>;
  private logListeners: Array<LogListener> = [];
  private _state: RuntimeWorkerState = RuntimeWorkerState.IDLE;

  constructor(key: string, runtime: FunctionsRuntimeInstance) {
    this.id = uuid.v4();
    this.key = key;
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

  execute(frb: FunctionsRuntimeBundle, opts?: InvokeRuntimeOpts): void {
    // Make a copy so we don't edit it
    const execFrb: FunctionsRuntimeBundle = { ...frb };

    // TODO(samstern): I would like to do this elsewhere...
    if (!execFrb.socketPath) {
      execFrb.socketPath = getTemporarySocketPath(this.runtime.pid, this.runtime.cwd);
      this.log(`Assigning socketPath: ${execFrb.socketPath}`);
    }

    const args: FunctionsRuntimeArgs = { frb: execFrb, opts };
    this.state = RuntimeWorkerState.BUSY;
    this.lastArgs = args;
    this.runtime.send(args);
  }

  get state(): RuntimeWorkerState {
    return this._state;
  }

  set state(state: RuntimeWorkerState) {
    if (state === RuntimeWorkerState.BUSY) {
      this.socketReady = EmulatorLog.waitForLog(
        this.runtime.events,
        "SYSTEM",
        "runtime-status",
        (el) => {
          return el.data.state === "ready";
        }
      );
    }

    if (state === RuntimeWorkerState.IDLE) {
      // Remove all temporary log listeners every time we move to IDLE
      for (const l of this.logListeners) {
        this.runtime.events.removeListener("log", l);
      }
      this.logListeners = [];
      this.socketReady = undefined;
    }

    if (state === RuntimeWorkerState.FINISHED) {
      this.runtime.events.removeAllListeners();
    }

    this.log(state);
    this._state = state;
    this.stateEvents.emit(this._state);
  }

  onLogs(listener: LogListener, forever = false) {
    if (!forever) {
      this.logListeners.push(listener);
    }

    this.runtime.events.on("log", listener);
  }

  waitForDone(): Promise<any> {
    if (this.state === RuntimeWorkerState.IDLE || this.state === RuntimeWorkerState.FINISHED) {
      return Promise.resolve();
    }

    return new Promise<void>((res) => {
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

  waitForSocketReady(): Promise<any> {
    return (
      this.socketReady ||
      Promise.reject(new Error("Cannot call waitForSocketReady() if runtime is not BUSY"))
    );
  }

  private log(msg: string): void {
    EmulatorLogger.forEmulator(Emulators.FUNCTIONS).log(
      "DEBUG",
      `[worker-${this.key}-${this.id}]: ${msg}`
    );
  }
}

export class RuntimeWorkerPool {
  private readonly workers: Map<string, Array<RuntimeWorker>> = new Map();

  constructor(private mode: FunctionsExecutionMode = FunctionsExecutionMode.AUTO) {}

  getKey(triggerId: string | undefined) {
    if (this.mode === FunctionsExecutionMode.SEQUENTIAL) {
      return "~shared~";
    } else {
      return triggerId || "~diagnostic~";
    }
  }

  /**
   * When code changes (or in some other rare circumstances) we need to get
   * a new pool of workers. For each IDLE worker we kill it immediately. For
   * each BUSY worker we move it to the FINISHING state so that it will
   * kill itself after it's done with its current task.
   */
  refresh() {
    for (const arr of this.workers.values()) {
      arr.forEach((w) => {
        if (w.state === RuntimeWorkerState.IDLE) {
          this.log(`Shutting down IDLE worker (${w.key})`);
          w.state = RuntimeWorkerState.FINISHING;
          w.runtime.shutdown();
        } else if (w.state === RuntimeWorkerState.BUSY) {
          this.log(`Marking BUSY worker to finish (${w.key})`);
          w.state = RuntimeWorkerState.FINISHING;
        }
      });
    }
  }

  /**
   * Immediately kill all workers.
   */
  exit() {
    for (const arr of this.workers.values()) {
      arr.forEach((w) => {
        if (w.state === RuntimeWorkerState.IDLE) {
          w.runtime.shutdown();
        } else {
          w.runtime.kill();
        }
      });
    }
  }

  /**
   * Determine if the pool has idle workers ready to accept work for the given triggerId;
   *
   * @param triggerId
   */
  readyForWork(triggerId: string | undefined): boolean {
    const idleWorker = this.getIdleWorker(triggerId);
    return !!idleWorker;
  }

  /**
   * Submit work to be run by an idle worker for the givenn triggerId.
   * Calls to this function should be guarded by readyForWork() to avoid throwing
   * an exception.
   *
   * @param triggerId
   * @param frb
   * @param opts
   */
  submitWork(
    triggerId: string | undefined,
    frb: FunctionsRuntimeBundle,
    opts?: InvokeRuntimeOpts
  ): RuntimeWorker {
    this.log(`submitWork(triggerId=${triggerId})`);
    const worker = this.getIdleWorker(triggerId);
    if (!worker) {
      throw new FirebaseError(
        "Internal Error: can't call submitWork without checking for idle workers"
      );
    }

    worker.execute(frb, opts);
    return worker;
  }

  getIdleWorker(triggerId: string | undefined): RuntimeWorker | undefined {
    this.cleanUpWorkers();
    const triggerWorkers = this.getTriggerWorkers(triggerId);
    if (!triggerWorkers.length) {
      this.setTriggerWorkers(triggerId, []);
      return;
    }

    for (const worker of triggerWorkers) {
      if (worker.state === RuntimeWorkerState.IDLE) {
        return worker;
      }
    }

    return;
  }

  addWorker(
    triggerId: string | undefined,
    runtime: FunctionsRuntimeInstance,
    extensionLogInfo?: ExtensionLogInfo
  ): RuntimeWorker {
    const worker = new RuntimeWorker(this.getKey(triggerId), runtime);
    this.log(`addWorker(${worker.key})`);

    const keyWorkers = this.getTriggerWorkers(triggerId);
    keyWorkers.push(worker);
    this.setTriggerWorkers(triggerId, keyWorkers);

    const logger = triggerId
      ? EmulatorLogger.forFunction(triggerId, extensionLogInfo)
      : EmulatorLogger.forEmulator(Emulators.FUNCTIONS);
    worker.onLogs((log: EmulatorLog) => {
      logger.handleRuntimeLog(log);
    }, true /* listen forever */);

    this.log(`Adding worker with key ${worker.key}, total=${keyWorkers.length}`);
    return worker;
  }

  getTriggerWorkers(triggerId: string | undefined): Array<RuntimeWorker> {
    return this.workers.get(this.getKey(triggerId)) || [];
  }

  private setTriggerWorkers(triggerId: string | undefined, workers: Array<RuntimeWorker>) {
    this.workers.set(this.getKey(triggerId), workers);
  }

  private cleanUpWorkers() {
    // Drop all finished workers from the pool
    for (const [key, keyWorkers] of this.workers.entries()) {
      const notDoneWorkers = keyWorkers.filter((worker) => {
        return worker.state !== RuntimeWorkerState.FINISHED;
      });

      if (notDoneWorkers.length !== keyWorkers.length) {
        this.log(
          `Cleaned up workers for ${key}: ${keyWorkers.length} --> ${notDoneWorkers.length}`
        );
      }
      this.setTriggerWorkers(key, notDoneWorkers);
    }
  }

  private log(msg: string): void {
    EmulatorLogger.forEmulator(Emulators.FUNCTIONS).log("DEBUG", `[worker-pool] ${msg}`);
  }
}

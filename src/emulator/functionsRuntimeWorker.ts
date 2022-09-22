import * as http from "http";
import * as uuid from "uuid";

import { FunctionsRuntimeInstance } from "./functionsEmulator";
import { EmulatorLog, Emulators, FunctionsExecutionMode } from "./types";
import { FunctionsRuntimeBundle } from "./functionsEmulatorShared";
import { EventEmitter } from "events";
import { EmulatorLogger, ExtensionLogInfo } from "./emulatorLogger";
import { FirebaseError } from "../error";
import { Serializable } from "child_process";

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

  stateEvents: EventEmitter = new EventEmitter();

  private logListeners: Array<LogListener> = [];
  private _state: RuntimeWorkerState = RuntimeWorkerState.IDLE;

  constructor(key: string, runtime: FunctionsRuntimeInstance) {
    this.id = uuid.v4();
    this.key = key;
    this.runtime = runtime;

    const childProc = this.runtime.process;
    let msgBuffer = "";
    childProc.on("message", (msg) => {
      msgBuffer = this.processStream(msg, msgBuffer);
    });

    let stdBuffer = "";
    if (childProc.stdout) {
      childProc.stdout.on("data", (data) => {
        stdBuffer = this.processStream(data, stdBuffer);
      });
    }

    if (childProc.stderr) {
      childProc.stderr.on("data", (data) => {
        stdBuffer = this.processStream(data, stdBuffer);
      });
    }

    childProc.on("exit", () => {
      this.log("exited");
      this.state = RuntimeWorkerState.FINISHED;
    });
  }

  private processStream(s: Serializable, buf: string): string {
    buf += s.toString();

    const lines = buf.split("\n");
    if (lines.length > 1) {
      // slice(0, -1) returns all elements but the last
      lines.slice(0, -1).forEach((line: string) => {
        const log = EmulatorLog.fromJSON(line);
        this.runtime.events.emit("log", log);

        if (log.level === "FATAL") {
          // Something went wrong, if we don't kill the process it'll wait for timeoutMs.
          this.runtime.events.emit("log", new EmulatorLog("SYSTEM", "runtime-status", "killed"));
          this.runtime.process.kill();
        }
      });
    }
    return lines[lines.length - 1];
  }

  sendDebugMsg(debug: FunctionsRuntimeBundle["debug"]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.runtime.process.send(JSON.stringify(debug), (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  request(req: http.RequestOptions, resp: http.ServerResponse, body?: unknown): Promise<void> {
    this.state = RuntimeWorkerState.BUSY;
    const onFinish = (): void => {
      if (this.state === RuntimeWorkerState.BUSY) {
        this.state = RuntimeWorkerState.IDLE;
      } else if (this.state === RuntimeWorkerState.FINISHING) {
        this.log(`IDLE --> FINISHING`);
        this.runtime.process.kill();
      }
    };
    return new Promise((resolve) => {
      const proxy = http.request(
        {
          method: req.method,
          path: req.path,
          headers: req.headers,
          socketPath: this.runtime.socketPath,
        },
        (_resp) => {
          resp.writeHead(_resp.statusCode || 200, _resp.headers);
          const piped = _resp.pipe(resp);
          piped.on("finish", () => {
            onFinish();
            resolve();
          });
        }
      );
      proxy.on("error", (err) => {
        resp.writeHead(500);
        resp.write(JSON.stringify(err));
        resp.end();
        this.runtime.process.kill();
        resolve();
      });
      if (body) {
        proxy.write(body);
      }
      proxy.end();
    });
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

  onLogs(listener: LogListener, forever = false) {
    if (!forever) {
      this.logListeners.push(listener);
    }

    this.runtime.events.on("log", listener);
  }

  isSocketReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = http
        .request(
          {
            method: "GET",
            path: "/__/health",
            socketPath: this.runtime.socketPath,
          },
          () => resolve()
        )
        .end();
      req.on("error", (error) => {
        reject(error);
      });
    });
  }

  async waitForSocketReady(): Promise<void> {
    const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
    const timeout = new Promise<never>((resolve, reject) => {
      setTimeout(() => {
        reject(new FirebaseError("Failed to load function."));
      }, 30_000);
    });
    while (true) {
      try {
        await Promise.race([this.isSocketReady(), timeout]);
        break;
      } catch (err: any) {
        // Allow us to wait until the server is listening.
        if (["ECONNREFUSED", "ENOENT"].includes(err?.code)) {
          await sleep(100);
          continue;
        }
        throw err;
      }
    }
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
          w.runtime.process.kill();
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
          w.runtime.process.kill();
        } else {
          w.runtime.process.kill();
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
   * Submit request to be handled by an idle worker for the given triggerId.
   * Caller should ensure that there is an idle worker to handle the request.
   *
   * @param triggerId
   * @param req Request to send to the trigger.
   * @param resp Response to proxy the response from the worker.
   * @param body Request body.
   * @param debug Debug payload to send prior to making request.
   */
  async submitRequest(
    triggerId: string,
    req: http.RequestOptions,
    resp: http.ServerResponse,
    body: unknown,
    debug?: FunctionsRuntimeBundle["debug"]
  ): Promise<void> {
    this.log(`submitRequest(triggerId=${triggerId})`);
    const worker = this.getIdleWorker(triggerId);
    if (!worker) {
      throw new FirebaseError(
        "Internal Error: can't call submitRequest without checking for idle workers"
      );
    }
    if (debug) {
      await worker.sendDebugMsg(debug);
    }
    return worker.request(req, resp, body);
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

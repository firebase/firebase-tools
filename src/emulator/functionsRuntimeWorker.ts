import * as http from "http";
import * as uuid from "uuid";

import { FunctionsRuntimeInstance } from "./functionsEmulator";
import { EmulatorLog, Emulators, FunctionsExecutionMode } from "./types";
import { EmulatedTriggerDefinition, FunctionsRuntimeBundle } from "./functionsEmulatorShared";
import { EventEmitter } from "events";
import { EmulatorLogger, ExtensionLogInfo } from "./emulatorLogger";
import { FirebaseError } from "../error";
import { Serializable } from "child_process";
import { getFunctionDiscoveryTimeout } from "../deploy/functions/runtimes/discovery";

type LogListener = (el: EmulatorLog) => any;

export enum RuntimeWorkerState {
  // Worker has been created but is not ready to accept work
  CREATED = "CREATED",

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

/**
 * Given no trigger key, worker is given this special key.
 *
 * This is useful when running the Functions Emulator in debug mode
 * where single process shared amongst all triggers.
 */
const FREE_WORKER_KEY = "~free~";

export class RuntimeWorker {
  readonly id: string;
  readonly triggerKey: string;

  stateEvents: EventEmitter = new EventEmitter();

  private logListeners: Array<LogListener> = [];
  private logger: EmulatorLogger;
  private _state: RuntimeWorkerState = RuntimeWorkerState.CREATED;
  private activeRequests = 0;
  private readonly maxConcurrency: number;

  constructor(
    triggerId: string | undefined,
    readonly runtime: FunctionsRuntimeInstance,
    readonly extensionLogInfo: ExtensionLogInfo,
    readonly timeoutSeconds?: number,
    maxConcurrency = 1,
  ) {
    this.id = uuid.v4();
    this.triggerKey = triggerId || FREE_WORKER_KEY;
    this.runtime = runtime;
    this.maxConcurrency = Math.max(1, maxConcurrency);

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

    this.logger = triggerId
      ? EmulatorLogger.forFunction(triggerId, extensionLogInfo)
      : EmulatorLogger.forEmulator(Emulators.FUNCTIONS);
    this.onLogs((log: EmulatorLog) => {
      this.logger.handleRuntimeLog(log);
    }, true /* listen forever */);

    childProc.on("exit", () => {
      this.logDebug("exited");
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

  readyForWork(): void {
    this.state = RuntimeWorkerState.IDLE;
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

  request(
    req: http.RequestOptions,
    resp: http.ServerResponse,
    body?: unknown,
    debug?: boolean,
    alreadyReserved = false,
  ): Promise<void> {
    return this.requestInternal(req, body, debug, resp, alreadyReserved);
  }

  requestWithoutResponse(
    req: http.RequestOptions,
    body?: unknown,
    debug?: boolean,
    alreadyReserved = false,
  ): Promise<void> {
    return this.requestInternal(req, body, debug, undefined, alreadyReserved);
  }

  private requestInternal(
    req: http.RequestOptions,
    body?: unknown,
    debug?: boolean,
    resp?: http.ServerResponse,
    alreadyReserved = false,
  ): Promise<void> {
    if (this.triggerKey !== FREE_WORKER_KEY) {
      this.logInfo(`Beginning execution of "${this.triggerKey}"`);
    }
    const startHrTime = process.hrtime();

    if (!alreadyReserved) {
      this.markRequestStart();
    }
    const onFinish = (): void => {
      if (this.triggerKey !== FREE_WORKER_KEY) {
        const elapsedHrTime = process.hrtime(startHrTime);
        this.logInfo(
          `Finished "${this.triggerKey}" in ${
            elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1000000
          }ms`,
        );
      }
      this.markRequestFinish();
    };
    return new Promise((resolve) => {
      let finished = false;
      const finishReq = (event?: string): void => {
        this.logger.log("DEBUG", `Finishing up request with event=${event}`);
        if (!finished) {
          finished = true;
          onFinish();
          resolve();
        }
      };
      const reqOpts = {
        ...this.runtime.conn.httpReqOpts(),
        method: req.method,
        path: req.path,
        headers: req.headers,
      };
      if (this.timeoutSeconds) {
        reqOpts.timeout = this.timeoutSeconds * 1000;
      }
      const proxy = http.request(reqOpts, (_resp: http.IncomingMessage) => {
        if (resp) {
          resp.writeHead(_resp.statusCode || 200, _resp.headers);
          _resp.on("pause", () => finishReq("pause"));
          _resp.on("end", () => finishReq("end"));
          _resp.on("close", () => finishReq("close"));
          const piped = _resp.pipe(resp);
          piped.on("finish", () => finishReq("finish"));
        } else {
          _resp.on("end", () => finishReq("end"));
          _resp.on("close", () => finishReq("close"));
          _resp.on("pause", () => finishReq("pause"));
          _resp.resume();
        }
      });
      if (debug) {
        proxy.setSocketKeepAlive(false);
        proxy.setTimeout(0);
      }
      proxy.on("timeout", () => {
        this.logger.log(
          "ERROR",
          `Your function timed out after ~${this.timeoutSeconds}s. To configure this timeout, see
      https://firebase.google.com/docs/functions/manage-functions#set_timeout_and_memory_allocation.`,
        );
        proxy.destroy();
      });
      proxy.on("error", (err) => {
        this.logger.log("ERROR", `Request to function failed: ${err}`);
        if (resp) {
          resp.writeHead(500);
          resp.write(JSON.stringify(err));
          resp.end();
        }
        this.runtime.process.kill();
        finishReq("error");
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

    this.logDebug(state);
    this._state = state;
    this.stateEvents.emit(this._state);
  }

  onLogs(listener: LogListener, forever = false) {
    if (!forever) {
      this.logListeners.push(listener);
    }

    this.runtime.events.on("log", listener);
  }

  availableSlots(): number {
    if (
      this.state === RuntimeWorkerState.CREATED ||
      this.state === RuntimeWorkerState.FINISHING ||
      this.state === RuntimeWorkerState.FINISHED
    ) {
      return 0;
    }
    return Math.max(0, this.maxConcurrency - this.activeRequests);
  }

  canAcceptWork(): boolean {
    return this.availableSlots() > 0;
  }

  tryReserve(): boolean {
    if (!this.canAcceptWork()) {
      return false;
    }
    this.markRequestStart();
    return true;
  }

  releaseReservation(): void {
    this.markRequestFinish();
  }

  isSocketReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          ...this.runtime.conn.httpReqOpts(),
          method: "GET",
          path: "/__/health",
        },
        () => {
          // Set the worker state to IDLE for new work
          this.readyForWork();
          resolve();
        },
      );
      req.end();
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
      }, getFunctionDiscoveryTimeout() || 30_000);
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

  private logDebug(msg: string): void {
    this.logger.log("DEBUG", `[worker-${this.triggerKey}-${this.id}]: ${msg}`);
  }

  private logInfo(msg: string): void {
    this.logger.logLabeled("BULLET", "functions", msg);
  }

  private markRequestStart(): void {
    this.activeRequests += 1;
    if (this.activeRequests === 1) {
      this.state = RuntimeWorkerState.BUSY;
    }
  }

  private markRequestFinish(): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    if (this.activeRequests === 0) {
      if (this.state === RuntimeWorkerState.BUSY) {
        this.state = RuntimeWorkerState.IDLE;
      } else if (this.state === RuntimeWorkerState.FINISHING) {
        this.logDebug(`IDLE --> FINISHING`);
        this.runtime.process.kill();
      }
    } else {
      this.notifyAvailability();
    }
  }

  private notifyAvailability(): void {
    if (this.availableSlots() > 0) {
      this.stateEvents.emit("available");
    }
  }
}

type WorkerWaiter = {
  triggerId: string;
  notify: () => void;
  reject: (err: Error) => void;
};

export class RuntimeWorkerPool {
  private readonly workers: Map<string, Array<RuntimeWorker>> = new Map();
  private readonly waiters: Map<string, Array<WorkerWaiter>> = new Map();
  private readonly pendingStarts: Map<string, number> = new Map();

  constructor(private mode: FunctionsExecutionMode = FunctionsExecutionMode.AUTO) {}

  getKey(triggerId: string | undefined): string {
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
  refresh(): void {
    this.rejectWaiters("Worker pool refreshed while waiting for an available worker.");
    for (const arr of this.workers.values()) {
      arr.forEach((w) => {
        if (w.state === RuntimeWorkerState.IDLE) {
          this.log(`Shutting down IDLE worker (${w.triggerKey})`);
          w.state = RuntimeWorkerState.FINISHING;
          w.runtime.process.kill();
        } else if (w.state === RuntimeWorkerState.BUSY) {
          this.log(`Marking BUSY worker to finish (${w.triggerKey})`);
          w.state = RuntimeWorkerState.FINISHING;
        }
      });
    }
  }

  /**
   * Immediately kill all workers.
   */
  exit(): void {
    this.rejectWaiters("Worker pool exited while waiting for an available worker.");
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
    debug?: FunctionsRuntimeBundle["debug"],
  ): Promise<void> {
    this.log(`submitRequest(triggerId=${triggerId})`);
    const worker = this.reserveWorker(triggerId);
    if (!worker) {
      throw new FirebaseError(
        "Internal Error: can't call submitRequest without checking for idle workers",
      );
    }
    if (debug) {
      try {
        await worker.sendDebugMsg(debug);
      } catch (err) {
        worker.releaseReservation();
        throw err;
      }
    }
    return worker.request(req, resp, body, !!debug, true);
  }

  getIdleWorker(triggerId: string | undefined): RuntimeWorker | undefined {
    this.cleanUpWorkers();
    const triggerWorkers = this.getTriggerWorkers(triggerId);
    if (!triggerWorkers.length) {
      this.setTriggerWorkers(triggerId, []);
      return;
    }

    for (const worker of triggerWorkers) {
      if (worker.canAcceptWork()) {
        return worker;
      }
    }

    return;
  }

  private reserveWorker(triggerId: string | undefined): RuntimeWorker | undefined {
    this.cleanUpWorkers();
    const triggerWorkers = this.getTriggerWorkers(triggerId);
    if (!triggerWorkers.length) {
      this.setTriggerWorkers(triggerId, []);
      return;
    }

    for (const worker of triggerWorkers) {
      if (worker.tryReserve()) {
        return worker;
      }
    }

    return;
  }

  /**
   * Adds a worker to the pool.
   * Caller must set the worker status to ready by calling
   * `worker.readyForWork()` or `worker.waitForSocketReady()`.
   */
  addWorker(
    trigger: EmulatedTriggerDefinition | undefined,
    runtime: FunctionsRuntimeInstance,
    extensionLogInfo: ExtensionLogInfo,
  ): RuntimeWorker {
    this.log(`addWorker(${this.getKey(trigger?.id)})`);
    // Disable worker timeout if:
    //   (1) This is a diagnostic call without trigger id OR
    //   (2) If in SEQUENTIAL execution mode
    const disableTimeout = !trigger?.id || this.mode === FunctionsExecutionMode.SEQUENTIAL;
    const worker = new RuntimeWorker(
      trigger?.id,
      runtime,
      extensionLogInfo,
      disableTimeout ? undefined : trigger?.timeoutSeconds,
      this.getConcurrency(trigger),
    );

    const key = this.getKey(trigger?.id);
    const notify = () => this.notifyAvailableByKey(key);
    worker.stateEvents.on(RuntimeWorkerState.IDLE, notify);
    worker.stateEvents.on("available", notify);

    const keyWorkers = this.getTriggerWorkers(trigger?.id);
    keyWorkers.push(worker);
    this.setTriggerWorkers(trigger?.id, keyWorkers);

    this.log(`Adding worker with key ${worker.triggerKey}, total=${keyWorkers.length}`);
    return worker;
  }

  getTriggerWorkers(triggerId: string | undefined): Array<RuntimeWorker> {
    return this.workers.get(this.getKey(triggerId)) || [];
  }

  private setTriggerWorkers(triggerId: string | undefined, workers: Array<RuntimeWorker>) {
    this.workers.set(this.getKey(triggerId), workers);
  }

  async getWorkerForRequest(
    trigger: EmulatedTriggerDefinition,
    startRuntime: () => Promise<RuntimeWorker>,
  ): Promise<RuntimeWorker> {
    const triggerId = trigger.id;
    const worker = this.reserveWorker(triggerId);
    if (worker) {
      return worker;
    }
    if (this.reserveStartSlot(trigger)) {
      try {
        const newWorker = await startRuntime();
        if (newWorker.tryReserve()) {
          return newWorker;
        }
      } catch (err) {
        const error = err instanceof Error ? err : new FirebaseError(String(err));
        this.rejectWaitersForKey(this.getKey(triggerId), error);
        throw error;
      } finally {
        this.releaseStartSlot(triggerId);
      }
      return this.waitForAvailableWorker(triggerId);
    }
    return this.waitForAvailableWorker(triggerId);
  }

  private cleanUpWorkers() {
    // Drop all finished workers from the pool
    for (const [key, keyWorkers] of this.workers.entries()) {
      const notDoneWorkers = keyWorkers.filter((worker) => {
        return worker.state !== RuntimeWorkerState.FINISHED;
      });

      if (notDoneWorkers.length !== keyWorkers.length) {
        this.log(
          `Cleaned up workers for ${key}: ${keyWorkers.length} --> ${notDoneWorkers.length}`,
        );
      }
      this.setTriggerWorkers(key, notDoneWorkers);
    }
  }

  private canCreateWorker(trigger: EmulatedTriggerDefinition | undefined): boolean {
    const key = this.getKey(trigger?.id);
    const totalCount =
      this.getTriggerWorkers(trigger?.id).length + this.getPendingStartsForKey(key);
    if (this.mode === FunctionsExecutionMode.SEQUENTIAL) {
      return totalCount === 0;
    }
    const maxInstances = this.getMaxInstances(trigger);
    if (!maxInstances) {
      return true;
    }
    return totalCount < maxInstances;
  }

  private getMaxInstances(trigger: EmulatedTriggerDefinition | undefined): number | undefined {
    const maxInstances = trigger?.maxInstances;
    if (typeof maxInstances !== "number") {
      return;
    }
    if (maxInstances <= 0) {
      return;
    }
    return maxInstances;
  }

  private getConcurrency(trigger: EmulatedTriggerDefinition | undefined): number {
    const concurrency = trigger?.concurrency;
    if (typeof concurrency === "number" && concurrency > 0) {
      return concurrency;
    }
    return 1;
  }

  private reserveStartSlot(trigger: EmulatedTriggerDefinition | undefined): boolean {
    if (!this.canCreateWorker(trigger)) {
      return false;
    }
    const key = this.getKey(trigger?.id);
    this.pendingStarts.set(key, this.getPendingStartsForKey(key) + 1);
    return true;
  }

  private releaseStartSlot(triggerId: string | undefined): void {
    const key = this.getKey(triggerId);
    const pending = this.getPendingStartsForKey(key);
    if (pending <= 1) {
      this.pendingStarts.delete(key);
      return;
    }
    this.pendingStarts.set(key, pending - 1);
  }

  private getPendingStartsForKey(key: string): number {
    return this.pendingStarts.get(key) || 0;
  }

  private availableCapacityForKey(key: string): number {
    const workers = this.workers.get(key) || [];
    return workers.reduce((total, worker) => total + worker.availableSlots(), 0);
  }

  private notifyAvailableByKey(key: string): void {
    const waiters = this.waiters.get(key);
    if (!waiters?.length) {
      return;
    }
    let capacity = this.availableCapacityForKey(key);
    while (capacity > 0 && waiters.length) {
      capacity -= 1;
      const waiter = waiters.shift();
      waiter?.notify();
    }
    if (!waiters.length) {
      this.waiters.delete(key);
    }
  }

  private waitForAvailableWorker(triggerId: string): Promise<RuntimeWorker> {
    const ready = this.reserveWorker(triggerId);
    if (ready) {
      return Promise.resolve(ready);
    }
    const key = this.getKey(triggerId);
    return new Promise((resolve, reject) => {
      const waiters = this.waiters.get(key) || [];
      const waiter: WorkerWaiter = {
        triggerId,
        notify: () => {
          const worker = this.reserveWorker(triggerId);
          if (worker) {
            resolve(worker);
            return;
          }
          void this.waitForAvailableWorker(triggerId).then(resolve).catch(reject);
        },
        reject,
      };
      waiters.push(waiter);
      this.waiters.set(key, waiters);
    });
  }

  private rejectWaiters(reason: string): void {
    if (!this.waiters.size) {
      return;
    }
    const error = new FirebaseError(reason);
    for (const waiters of this.waiters.values()) {
      while (waiters.length) {
        const waiter = waiters.shift();
        waiter?.reject(error);
      }
    }
    this.waiters.clear();
  }

  private rejectWaitersForKey(key: string, error: Error): void {
    const waiters = this.waiters.get(key);
    if (!waiters?.length) {
      return;
    }
    while (waiters.length) {
      const waiter = waiters.shift();
      waiter?.reject(error);
    }
    this.waiters.delete(key);
  }

  private log(msg: string): void {
    EmulatorLogger.forEmulator(Emulators.FUNCTIONS).log("DEBUG", `[worker-pool] ${msg}`);
  }
}

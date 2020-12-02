import * as utils from "../utils";
import { FirebaseError } from "../error";

import { EmulatorLogger } from "./emulatorLogger";
import { Emulators, FunctionsExecutionMode } from "./types";

type Work = () => Promise<any>;

/**
 * Queue for doing async work that can either run all work concurrently
 * or sequentially (FIFO).
 *
 * Errors within work items are not exposed to the caller, they are just
 * logged as debug info. If better error handling is needed attach a catch()
 * callback inside the Work function.
 */
export class WorkQueue {
  private static MAX_PARALLEL_ENV = "FUNCTIONS_EMULATOR_PARALLEL";
  private static DEFAULT_MAX_PARALLEL = Number.parseInt(
    utils.envOverride(WorkQueue.MAX_PARALLEL_ENV, "50")
  );

  private logger = EmulatorLogger.forEmulator(Emulators.FUNCTIONS);

  private queue: Array<Work> = [];
  private workRunningCount: number = 0;
  private notifyQueue: () => void = () => {
    // Noop by default, will be set by .start() when queue is empty.
  };
  private notifyWorkFinish: () => void = () => {
    // Noop by default, will be set by .start() when there are too many jobs.
  };
  private stopped = true;

  constructor(
    private mode: FunctionsExecutionMode = FunctionsExecutionMode.AUTO,
    private maxParallelWork: number = WorkQueue.DEFAULT_MAX_PARALLEL
  ) {
    if (maxParallelWork < 1) {
      throw new FirebaseError(
        `Cannot run Functions emulator with less than 1 parallel worker (${
          WorkQueue.MAX_PARALLEL_ENV
        }=${process.env[WorkQueue.MAX_PARALLEL_ENV]})`
      );
    }
  }

  /**
   * Submit an entry to the queue and run it according to the WorkMode.
   *
   * Note: make sure start() has been called at some point.
   */
  submit(entry: Work) {
    this.queue.push(entry);
    this.notifyQueue();
    this.logState();
  }

  /**
   * Begin processing work from the queue.
   */
  async start() {
    if (!this.stopped) {
      return;
    }

    this.stopped = false;
    while (!this.stopped) {
      // If the queue is empty, wait until something is added.
      if (!this.queue.length) {
        await new Promise((res) => {
          this.notifyQueue = res;
        });
      }

      // If we have too many jobs out, wait until something finishes.
      if (this.workRunningCount >= this.maxParallelWork) {
        this.logger.logLabeled(
          "DEBUG",
          "work-queue",
          `waiting for work to finish (running=${this.workRunningCount})`
        );
        await new Promise((res) => {
          this.notifyWorkFinish = res;
        });
      }

      const workPromise = this.runNext();
      if (this.mode === FunctionsExecutionMode.SEQUENTIAL) {
        await workPromise;
      }
    }
  }

  /**
   * Stop processing work from the queue.
   */
  stop() {
    this.stopped = true;
  }

  async flush(timeoutMs: number = 60000) {
    if (!this.isWorking()) {
      return;
    }

    this.logger.logLabeled("BULLET", "functions", "Waiting for all functions to finish...");
    return new Promise((res, rej) => {
      const delta = 100;
      let elapsed = 0;

      const interval = setInterval(() => {
        elapsed += delta;
        if (elapsed >= timeoutMs) {
          rej(new Error(`Functions work queue not empty after ${timeoutMs}ms`));
        }

        if (!this.isWorking()) {
          clearInterval(interval);
          res();
        }
      }, delta);
    });
  }

  getState() {
    return {
      queueLength: this.queue.length,
      workRunningCount: this.workRunningCount,
    };
  }

  private isWorking() {
    const state = this.getState();
    return state.queueLength > 0 || state.workRunningCount > 0;
  }

  private async runNext() {
    const next = this.queue.shift();
    if (next) {
      this.workRunningCount++;
      this.logState();

      try {
        await next();
      } catch (e) {
        this.logger.log("DEBUG", e);
      } finally {
        this.workRunningCount--;
        this.notifyWorkFinish();
        this.logState();
      }
    }
  }

  private logState() {
    this.logger.logLabeled("DEBUG", "work-queue", JSON.stringify(this.getState()));
  }
}

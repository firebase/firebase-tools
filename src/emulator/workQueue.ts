import { EmulatorLogger } from "./emulatorLogger";
import { FunctionsExecutionMode } from "./types";

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
  private queue: Array<Work> = [];
  private workRunningCount: number = 0;
  private notifyQueue: () => void = () => {};
  private stopped: boolean = true;

  constructor(private mode: FunctionsExecutionMode = FunctionsExecutionMode.AUTO) {}

  /**
   * Submit an entry to the queue and run it according to the WorkMode.
   *
   * Note: make sure start() has been called at some point.
   */
  submit(entry: Work) {
    this.append(entry);
    if (this.shouldRunNext()) {
      this.runNext();
    }
  }

  /**
   * Begin processing work from the queue.
   */
  async start() {
    this.stopped = false;
    while (!this.stopped) {
      if (!this.queue.length) {
        await new Promise((resolve) => {
          this.notifyQueue = resolve;
        });
      }

      if (this.shouldRunNext()) {
        this.runNext();
      }
    }
  }

  /**
   * Stop processing work from the queue.
   */
  stop() {
    this.stopped = true;
  }

  private shouldRunNext() {
    switch (this.mode) {
      case FunctionsExecutionMode.AUTO:
        return true;
      case FunctionsExecutionMode.SEQUENTIAL:
        return this.workRunningCount === 0;
    }
  }

  private runNext() {
    const next = this.queue.shift();
    if (next) {
      this.workRunningCount++;
      this.logState();

      next()
        .then(() => {
          this.workRunningCount--;
          this.logState();
        })
        .catch((e) => {
          this.workRunningCount--;
          this.logState();
          EmulatorLogger.log("DEBUG", e);
        });
    }
  }

  private append(entry: Work) {
    this.queue.push(entry);
    this.notifyQueue();
    this.logState();
  }

  private logState() {
    EmulatorLogger.logLabeled(
      "DEBUG",
      "work-queue",
      JSON.stringify({
        queueLength: this.queue.length,
        workRunningCount: this.workRunningCount,
      })
    );
  }
}

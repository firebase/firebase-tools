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

    const shouldRunImmediately =
      this.mode === FunctionsExecutionMode.AUTO ||
      (this.mode === FunctionsExecutionMode.SEQUENTIAL && this.workRunningCount === 0);
    if (!this.stopped && shouldRunImmediately) {
      this.runNext();
    }
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
      if (!this.queue.length) {
        await new Promise((res) => {
          this.notifyQueue = res;
        });

        const workPromise = this.runNext();
        if (this.mode === FunctionsExecutionMode.SEQUENTIAL) {
          await workPromise;
        }
      }
    }
  }

  /**
   * Stop processing work from the queue.
   */
  stop() {
    this.stopped = true;
  }

  private async runNext() {
    const next = this.queue.shift();
    if (next) {
      this.workRunningCount++;
      this.logState();

      try {
        await next();
      } catch (e) {
        EmulatorLogger.log("DEBUG", e);
      } finally {
        this.workRunningCount--;
        this.logState();
      }
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

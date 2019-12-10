import { EmulatorLogger } from "./emulatorLogger";
import { FunctionsExecutionMode } from "./types";

type Work = () => Promise<any>;

/**
 * Queue for doing async work that can either run all work concurrently
 * or sequentially (FIFO).
 */
export class WorkQueue {
  private queue: Array<Work> = [];
  private interval?: NodeJS.Timeout;
  private workRunningCountInternal: number = 0;

  constructor(private mode: FunctionsExecutionMode = FunctionsExecutionMode.AUTO) {}

  /**
   * Submit an entry to the queue and run it according to the WorkMode.
   *
   * Note: make sure start() has been called at some point.
   */
  submit(entry: Work) {
    this.append(entry);
    if (this.mode === FunctionsExecutionMode.AUTO) {
      this.runNext();
    }
  }

  /**
   * Begin processing work from the queue.
   */
  start() {
    if (this.mode === FunctionsExecutionMode.AUTO) {
      return;
    }

    this.interval = setInterval(() => {
      if (!this.workRunning) {
        this.runNext();
      }
    }, 100);
  }

  /**
   * Stop processing work from the queue.
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  getState() {
    return {
      queueLength: this.queue.length,
      isRunning: this.workRunning,
      numRunning: this.workRunningCountInternal,
    };
  }

  get workRunning(): boolean {
    return this.workRunningCountInternal > 0;
  }

  set workRunningCount(count: number) {
    this.workRunningCountInternal = count;
    this.logState();
  }

  private runNext() {
    const next = this.queue.shift();
    if (next) {
      this.workRunningCount++;

      next().then(
        () => {
          this.workRunningCount--;
        },
        () => {
          this.workRunningCount--;
        }
      );
    }
  }

  private append(entry: Work) {
    this.queue.push(entry);
    this.logState();
  }

  private logState() {
    EmulatorLogger.logLabeled("DEBUG", "work-queue", JSON.stringify(this.getState()));
  }
}

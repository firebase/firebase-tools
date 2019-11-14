import { EmulatorLogger } from "./emulatorLogger";

type Work = () => Promise<any>;

// TODO(samstern): Can probably share this with the WorkerPool enum?
export enum WorkMode {
  /**
   * Run all work as soon as it is submitted to the queue.
   */
  CONCURRENT,

  /**
   * Run one piece of work at a time, FIFO.
   */
  SEQUENTIAL,
}

/**
 * Queue for doing async work that can either run all work concurrently
 * or sequentially (FIFO).
 */
export class WorkQueue {
  private queue: Array<Work> = [];
  private interval?: NodeJS.Timeout;
  private workRunningInternal: boolean = false;

  constructor(private mode: WorkMode = WorkMode.CONCURRENT) {}

  /**
   * Submit an entry to the queue and run it according to the WorkMode.
   *
   * Note: make sure start() has been called at some point.
   */
  submit(entry: Work) {
    if (this.mode == WorkMode.SEQUENTIAL) {
      this.append(entry);
    } else {
      entry();
    }
  }

  /**
   * Begin processing work from the queue.
   */
  start() {
    this.interval = setInterval(() => {
      if (
        this.mode === WorkMode.CONCURRENT ||
        (this.mode === WorkMode.SEQUENTIAL && !this.workRunning)
      ) {
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

  get workRunning(): boolean {
    return this.workRunningInternal;
  }

  set workRunning(workRunning: boolean) {
    this.workRunningInternal = workRunning;
    this.logState();
  }

  private runNext() {
    const next = this.queue.shift();
    if (next) {
      this.workRunning = true;

      next().finally(() => {
        this.workRunning = false;
      });
    }
  }

  private append(entry: Work) {
    this.queue.push(entry);
    this.logState();
  }

  private logState() {
    EmulatorLogger.log(
      "DEBUG",
      `[work-queue] ${JSON.stringify({
        length: this.queue.length,
        isRunning: this.workRunningInternal,
      })}`
    );
  }
}

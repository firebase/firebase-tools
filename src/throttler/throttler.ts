import { logger } from "../logger";
import RetriesExhaustedError from "./errors/retries-exhausted-error";
import TimeoutError from "./errors/timeout-error";
import TaskError from "./errors/task-error";

/**
 * Creates a promise to wait for the nth backoff.
 */
export function backoff(retryNumber: number, delay: number, maxDelay: number): Promise<void> {
  return new Promise((resolve: () => void) => {
    setTimeout(resolve, timeToWait(retryNumber, delay, maxDelay));
  });
}

// Exported for unit testing.
/**
 * time to wait between backoffs
 */
export function timeToWait(retryNumber: number, delay: number, maxDelay: number): number {
  return Math.min(delay * Math.pow(2, retryNumber), maxDelay);
}

function DEFAULT_HANDLER<R>(task: any): Promise<R> {
  return (task as () => Promise<R>)();
}

export interface ThrottlerOptions<T, R> {
  name?: string;
  concurrency?: number;
  handler?: (task: T) => Promise<R>;
  retries?: number;
  backoff?: number;
  maxBackoff?: number;
}

export interface ThrottlerStats {
  max: number;
  min: number;
  avg: number;
  active: number;
  complete: number;
  success: number;
  errored: number;
  retried: number;
  total: number;
  elapsed: number;
}

interface TaskData<T, R> {
  task: T;
  retryCount: number;
  wait?: { resolve: (value: R) => void; reject: (err: TaskError) => void };
  timeoutMillis?: number;
  timeoutId?: NodeJS.Timeout;
  isTimedOut: boolean;
}

/**
 * Throttler is a task scheduler that throttles the maximum number of tasks running at the same time.
 * In the case of failure, it will retry with exponential backoff, until exceeding the retries limit.
 * T is the type of task. R is the type of the handler's result.
 * You can use throttler in two ways:
 * 1. Specify handler that is (T) => R.
 * 2. Not specify the handler, but T must be () => R.
 */
export abstract class Throttler<T, R> {
  name = "";
  concurrency = 200;
  handler: (task: T) => Promise<any> = DEFAULT_HANDLER;
  active = 0;
  complete = 0;
  success = 0;
  errored = 0;
  retried = 0;
  total = 0;
  taskDataMap = new Map<number, TaskData<T, R>>();
  waits: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  min = 9999999999;
  max = 0;
  avg = 0;
  retries = 0;
  backoff = 200;
  maxBackoff = 60000; // 1 minute
  closed = false;
  finished = false;
  startTime = 0;

  constructor(options: ThrottlerOptions<T, R>) {
    if (options.name) {
      this.name = options.name;
    }
    if (options.handler) {
      this.handler = options.handler;
    }
    if (typeof options.concurrency === "number") {
      this.concurrency = options.concurrency;
    }
    if (typeof options.retries === "number") {
      this.retries = options.retries;
    }
    if (typeof options.backoff === "number") {
      this.backoff = options.backoff;
    }
    if (typeof options.maxBackoff === "number") {
      this.maxBackoff = options.maxBackoff;
    }
  }

  /**
   * @return `true` if there are unscheduled task waiting to be scheduled.
   */
  abstract hasWaitingTask(): boolean;

  /**
   * @return the index of the next task to schedule.
   */
  abstract nextWaitingTaskIndex(): number;

  /**
   * Return a promise that waits until the Throttler is closed and all tasks finish.
   */
  wait(): Promise<void> {
    const p = new Promise<void>((resolve, reject) => {
      this.waits.push({ resolve, reject });
    });
    return p;
  }

  /**
   * Add the task to the throttler.
   * When the task is completed, resolve will be called with handler's result.
   * If this task fails after retries, reject will be called with the error.
   */
  add(task: T, timeoutMillis?: number): void {
    this.addHelper(task, timeoutMillis);
  }

  /**
   * Add the task to the throttler and return a promise of handler's result.
   * If the task failed, both the promised returned by throttle and wait will reject.
   */
  run(task: T, timeoutMillis?: number): Promise<R> {
    return new Promise((resolve, reject) => {
      this.addHelper(task, timeoutMillis, { resolve, reject });
    });
  }

  /**
   * Signal that no more tasks will be added to the throttler, but any tasks already added to the
   * throttler will continue to run
   */
  close(): boolean {
    this.closed = true;
    return this.finishIfIdle();
  }

  process(): void {
    if (this.finishIfIdle() || this.active >= this.concurrency || !this.hasWaitingTask()) {
      return;
    }

    this.active++;
    this.handle(this.nextWaitingTaskIndex());
  }

  async handle(cursorIndex: number): Promise<void> {
    const taskData = this.taskDataMap.get(cursorIndex);
    if (!taskData) {
      throw new Error(`taskData.get(${cursorIndex}) does not exist`);
    }
    const promises = [this.executeTask(cursorIndex)];
    if (taskData.timeoutMillis) {
      promises.push(this.initializeTimeout(cursorIndex));
    }

    let result;
    try {
      result = await Promise.race(promises);
    } catch (err: any) {
      this.errored++;
      this.complete++;
      this.active--;
      this.onTaskFailed(err, cursorIndex);
      return;
    }
    this.success++;
    this.complete++;
    this.active--;
    this.onTaskFulfilled(result, cursorIndex);
  }

  stats(): ThrottlerStats {
    return {
      max: this.max,
      min: this.min,
      avg: this.avg,
      active: this.active,
      complete: this.complete,
      success: this.success,
      errored: this.errored,
      retried: this.retried,
      total: this.total,
      elapsed: Date.now() - this.startTime,
    };
  }

  taskName(cursorIndex: number): string {
    const taskData = this.taskDataMap.get(cursorIndex);
    if (!taskData) {
      return "finished task";
    }
    return typeof taskData.task === "string" ? taskData.task : `index ${cursorIndex}`;
  }

  private addHelper(
    task: T,
    timeoutMillis?: number,
    wait?: { resolve: (result: R) => void; reject: (err: Error) => void },
  ): void {
    if (this.closed) {
      throw new Error("Cannot add a task to a closed throttler.");
    }
    if (!this.startTime) {
      this.startTime = Date.now();
    }
    this.taskDataMap.set(this.total, {
      task,
      wait,
      timeoutMillis,
      retryCount: 0,
      isTimedOut: false,
    });
    this.total++;
    this.process();
  }

  private finishIfIdle(): boolean {
    if (this.closed && !this.hasWaitingTask() && this.active === 0) {
      this.finish();
      return true;
    }

    return false;
  }

  private finish(err?: TaskError): void {
    this.waits.forEach((p) => {
      if (err) {
        return p.reject(err);
      }
      this.finished = true;
      return p.resolve();
    });
  }

  private initializeTimeout(cursorIndex: number): Promise<void> {
    const taskData = this.taskDataMap.get(cursorIndex)!;
    const timeoutMillis = taskData.timeoutMillis!;
    const timeoutPromise = new Promise<void>((_, reject) => {
      taskData.timeoutId = setTimeout(() => {
        taskData.isTimedOut = true;
        reject(new TimeoutError(this.taskName(cursorIndex), timeoutMillis));
      }, timeoutMillis);
    });

    return timeoutPromise;
  }

  private async executeTask(cursorIndex: number): Promise<any> {
    const taskData = this.taskDataMap.get(cursorIndex)!;
    const t0 = Date.now();
    let result;
    try {
      result = await this.handler(taskData.task);
    } catch (err: any) {
      if (taskData.retryCount === this.retries) {
        throw new RetriesExhaustedError(this.taskName(cursorIndex), this.retries, err);
      }
      await backoff(taskData.retryCount + 1, this.backoff, this.maxBackoff);
      if (taskData.isTimedOut) {
        throw new TimeoutError(this.taskName(cursorIndex), taskData.timeoutMillis!);
      }
      this.retried++;
      taskData.retryCount++;
      logger.debug(`[${this.name}] Retrying task`, this.taskName(cursorIndex));
      return this.executeTask(cursorIndex);
    }

    if (taskData.isTimedOut) {
      throw new TimeoutError(this.taskName(cursorIndex), taskData.timeoutMillis!);
    }
    const dt = Date.now() - t0;
    this.min = Math.min(dt, this.min);
    this.max = Math.max(dt, this.max);
    this.avg = (this.avg * this.complete + dt) / (this.complete + 1);
    return result;
  }

  private onTaskFulfilled(result: any, cursorIndex: number): void {
    const taskData = this.taskDataMap.get(cursorIndex)!;
    if (taskData.wait) {
      taskData.wait.resolve(result);
    }
    this.cleanupTask(cursorIndex);
    this.process();
  }

  private onTaskFailed(error: TaskError, cursorIndex: number): void {
    const taskData = this.taskDataMap.get(cursorIndex)!;
    logger.debug(error);

    if (taskData.wait) {
      taskData.wait.reject(error);
    }
    this.cleanupTask(cursorIndex);
    this.finish(error);
  }

  private cleanupTask(cursorIndex: number): void {
    const { timeoutId } = this.taskDataMap.get(cursorIndex)!;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    this.taskDataMap.delete(cursorIndex);
  }
}

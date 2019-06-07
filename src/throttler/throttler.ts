import * as logger from "../logger";

function backoff(retryNumber: number, delay: number): Promise<void> {
  return new Promise((resolve: () => void) => {
    setTimeout(resolve, delay * Math.pow(2, retryNumber));
  });
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
  retriesRemaining: number;
  timeout?: number;
  wait?: { resolve: (R: any) => void; reject: (err: Error) => void };
  status: TaskStatus;
  result?: R;
  error?: Error;
}

enum TaskStatus {
  NOT_STARTED,
  RUNNING,
  FULFILLED,
  RETRIES_EXHAUSTED,
  TIMEOUT,
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
  name: string = "";
  concurrency: number = 200;
  handler: (task: T) => Promise<any> = DEFAULT_HANDLER;
  active: number = 0;
  complete: number = 0;
  success: number = 0;
  errored: number = 0;
  retried: number = 0;
  total: number = 0;
  taskDataMap = new Map<number, TaskData<T, R>>();
  taskTimeoutIdMap = new Map<number, NodeJS.Timeout>();
  isTimedOutMap = new Map<number, boolean>();
  waits: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  min: number = 9999999999;
  max: number = 0;
  avg: number = 0;
  retries: number = 0;
  backoff: number = 200;
  closed: boolean = false;
  finished: boolean = false;
  startTime: number = 0;

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
    if (typeof options.backoff === "number") {
      this.backoff = options.backoff;
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
  add(task: T): void {
    this.addHelper(task);
  }

  /**
   * Add the task to the throttler and return a promise of handler's result.
   * If the task failed, both the promised returned by throttle and wait will reject.
   */
  run(task: T, timeout?: number): Promise<R> {
    return new Promise((resolve, reject) => {
      this.addHelper(task, timeout, { resolve, reject });
    });
  }

  close(): boolean {
    this.closed = true;
    return this.finishIfIdle();
  }

  async handle(cursorIndex: number): Promise<void> {
    const taskData = this.taskDataMap.get(cursorIndex);
    if (!taskData) {
      throw new Error(`taskData.get(${cursorIndex}) does not exist`);
    }
    switch (taskData.status) {
      case TaskStatus.NOT_STARTED:
        this.initializeTask(taskData, cursorIndex);
        break;
      case TaskStatus.RUNNING:
        await this.executeTask(taskData, cursorIndex);
        break;
      case TaskStatus.FULFILLED:
        return this.onTaskFulfilled(taskData, cursorIndex);
      case TaskStatus.TIMEOUT:
        return this.onTaskFailed(
          taskData,
          cursorIndex,
          `Task ${this.taskName(cursorIndex)} timed out`
        );
      case TaskStatus.RETRIES_EXHAUSTED:
        return this.onTaskFailed(
          taskData,
          cursorIndex,
          `Retries exhausted on task ${this.taskName(cursorIndex)}`
        );
    }

    return this.handle(cursorIndex);
  }

  process(): void {
    if (this.finishIfIdle() || this.active >= this.concurrency || !this.hasWaitingTask()) {
      return;
    }

    this.active++;
    this.handle(this.nextWaitingTaskIndex());
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

  private initializeTask(taskData: TaskData<T, R>, cursorIndex: number): void {
    this.taskDataMap.set(cursorIndex, {
      ...taskData,
      status: TaskStatus.RUNNING,
    });
    if (taskData.timeout) {
      this.taskTimeoutIdMap.set(
        cursorIndex,
        setTimeout(() => {
          this.isTimedOutMap.set(cursorIndex, true);
        }, taskData.timeout)
      );
    }
  }

  private async executeTask(taskData: TaskData<T, R>, cursorIndex: number): Promise<void> {
    const updatedTaskData = { ...taskData };

    const t0 = Date.now();
    try {
      updatedTaskData.result = await this.handler(taskData.task);
      const dt = Date.now() - t0;
      if (dt < this.min) {
        this.min = dt;
      }
      if (dt > this.max) {
        this.max = dt;
      }
      this.avg = (this.avg * this.complete + dt) / (this.complete + 1);

      this.success++;
      this.complete++;
      this.active--;
      updatedTaskData.status = TaskStatus.FULFILLED;
    } catch (err) {
      if (taskData.retriesRemaining === 0) {
        updatedTaskData.status = TaskStatus.RETRIES_EXHAUSTED;
        updatedTaskData.error = err;
      } else if (this.isTimedOutMap.get(cursorIndex)) {
        updatedTaskData.status = TaskStatus.TIMEOUT;
        updatedTaskData.error = err;
      } else {
        this.retried++;
        updatedTaskData.retriesRemaining--;
        await backoff(this.retries - updatedTaskData.retriesRemaining, this.backoff);
        logger.debug(`[${this.name}] Retrying task`, this.taskName(cursorIndex));
      }
    }

    this.taskDataMap.set(cursorIndex, updatedTaskData);
  }

  private onTaskFulfilled(taskData: TaskData<T, R>, cursorIndex: number): void {
    if (taskData.wait) {
      taskData.wait.resolve(taskData.result);
    }
    this.cleanupTask(cursorIndex);
    this.process();
  }

  private onTaskFailed(taskData: TaskData<T, R>, cursorIndex: number, failureReason: string): void {
    this.errored++;
    this.complete++;
    this.active--;

    logger.debug(failureReason, taskData.error);

    // TODO: Create a new Error class to include the task error on the previous retry and reason
    // why we stop retrying (timeout | no_more_retries)
    const error = taskData.error || new Error(failureReason);

    if (taskData.wait) {
      taskData.wait.reject(error);
    }
    this.cleanupTask(cursorIndex);
    this.finish(error);
  }

  private cleanupTask(cursorIndex: number): void {
    const timeoutId = this.taskTimeoutIdMap.get(cursorIndex);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.taskTimeoutIdMap.delete(cursorIndex);
    }
    this.isTimedOutMap.delete(cursorIndex);
    this.taskDataMap.delete(cursorIndex);
  }

  private addHelper(
    task: T,
    timeout?: number,
    wait?: { resolve: (result: R) => void; reject: (err: Error) => void }
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
      timeout,
      retriesRemaining: this.retries,
      status: TaskStatus.NOT_STARTED,
    });
    this.total++;
    this.process();
  }

  private finishIfIdle(): boolean {
    if (this.closed && !this.hasWaitingTask() && this.active === 0) {
      this.finish(null);
      return true;
    }

    return false;
  }

  private finish(err: Error | null): void {
    this.waits.forEach((p) => {
      if (err) {
        return p.reject(err);
      }
      this.finished = true;
      return p.resolve();
    });
  }
}
